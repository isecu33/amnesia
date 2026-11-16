"""Versión web de un rig: `<animal>-rig.glb` → `<animal>-rig.web.glb` (D-067).

Reescribe el GLB a nivel binario, sin reimportarlo en Blender: malla, pesos, esqueleto y
animaciones quedan byte a byte iguales. Solo cambia lo que el cliente descarta igualmente
(`packages/client/src/scene/rig-models.ts`):
  - quita las texturas de normales, metal/rugosidad, oclusión y emisión;
  - reduce el color base a WEB_TEXTURE_PX (el juego lo pinta a RIG_TEXTURE_PX = 256).
Blender solo se usa para reescalar la imagen.

Uso: blender -b --python tools/rig/rig_web.py -- <entrada.glb> <salida.glb>
"""
import json
import os
import struct
import sys
import tempfile

import bpy

WEB_TEXTURE_PX = 256  # = RIG_TEXTURE_PX del cliente
GLB_MAGIC = 0x46546C67
CHUNK_JSON = 0x4E4F534A
CHUNK_BIN = 0x004E4942
DROPPED_MATERIAL_TEXTURES = ("normalTexture", "occlusionTexture", "emissiveTexture")


def read_glb(path):
    with open(path, "rb") as f:
        data = f.read()
    magic, _version, _length = struct.unpack_from("<III", data, 0)
    if magic != GLB_MAGIC:
        raise ValueError(f"{path} no es un GLB")
    offset, gltf, binary = 12, None, b""
    while offset < len(data):
        size, kind = struct.unpack_from("<II", data, offset)
        chunk = data[offset + 8 : offset + 8 + size]
        if kind == CHUNK_JSON:
            gltf = json.loads(chunk.decode("utf-8"))
        elif kind == CHUNK_BIN:
            binary = chunk
        offset += 8 + size
    if gltf is None:
        raise ValueError(f"{path} sin chunk JSON")
    return gltf, binary


def pad4(b, fill=b"\x00"):
    return b + fill * ((4 - len(b) % 4) % 4)


def write_glb(path, gltf, binary):
    js = pad4(json.dumps(gltf, separators=(",", ":")).encode("utf-8"), b" ")
    binary = pad4(binary)
    total = 12 + 8 + len(js) + 8 + len(binary)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", GLB_MAGIC, 2, total))
        f.write(struct.pack("<II", len(js), CHUNK_JSON) + js)
        f.write(struct.pack("<II", len(binary), CHUNK_BIN) + binary)


def strip_materials(gltf):
    for mat in gltf.get("materials", []):
        for key in DROPPED_MATERIAL_TEXTURES:
            mat.pop(key, None)
        pbr = mat.get("pbrMetallicRoughness", {})
        pbr.pop("metallicRoughnessTexture", None)


def used_texture_indices(gltf):
    used = set()
    for mat in gltf.get("materials", []):
        tex = mat.get("pbrMetallicRoughness", {}).get("baseColorTexture")
        if tex is not None:
            used.add(tex["index"])
    return used


def shrink_png(png_bytes, mime):
    """Reescala con Blender a WEB_TEXTURE_PX (sin ampliar) y devuelve PNG."""
    ext = ".jpg" if mime == "image/jpeg" else ".png"
    tmp = tempfile.mkdtemp()
    src, dst = os.path.join(tmp, "src" + ext), os.path.join(tmp, "dst.png")
    with open(src, "wb") as f:
        f.write(png_bytes)
    img = bpy.data.images.load(src)
    w, h = img.size
    if max(w, h) > WEB_TEXTURE_PX:
        k = WEB_TEXTURE_PX / max(w, h)
        img.scale(max(1, round(w * k)), max(1, round(h * k)))
    img.filepath_raw = dst
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)
    with open(dst, "rb") as f:
        return f.read()


def view_bytes(gltf, binary, view_index):
    v = gltf["bufferViews"][view_index]
    start = v.get("byteOffset", 0)
    return binary[start : start + v["byteLength"]]


def rebuild(gltf, binary):
    strip_materials(gltf)
    keep_tex = sorted(used_texture_indices(gltf))
    tex_map = {old: new for new, old in enumerate(keep_tex)}
    textures = [gltf["textures"][i] for i in keep_tex]
    keep_img = sorted({t["source"] for t in textures})
    img_map = {old: new for new, old in enumerate(keep_img)}
    for t in textures:
        t["source"] = img_map[t["source"]]
    for mat in gltf.get("materials", []):
        tex = mat.get("pbrMetallicRoughness", {}).get("baseColorTexture")
        if tex is not None:
            tex["index"] = tex_map[tex["index"]]
    images = [gltf["images"][i] for i in keep_img]

    # Vistas vivas: las de los accesores (geometría, pesos, animación) + las imágenes conservadas.
    payload = {}  # índice antiguo de vista → bytes nuevos
    for acc in gltf.get("accessors", []):
        refs = [acc.get("bufferView")]
        sparse = acc.get("sparse")
        if sparse:
            refs += [sparse["indices"]["bufferView"], sparse["values"]["bufferView"]]
        for r in refs:
            if r is not None and r not in payload:
                payload[r] = view_bytes(gltf, binary, r)
    for img in images:
        raw = view_bytes(gltf, binary, img["bufferView"])
        payload[img["bufferView"]] = shrink_png(raw, img.get("mimeType", "image/png"))
        img["mimeType"] = "image/png"

    out, views, view_map = bytearray(), [], {}
    for old in sorted(payload):
        while len(out) % 4:
            out.append(0)
        view = dict(gltf["bufferViews"][old])
        view["byteOffset"] = len(out)
        view["byteLength"] = len(payload[old])
        view["buffer"] = 0
        view_map[old] = len(views)
        views.append(view)
        out += payload[old]

    for acc in gltf.get("accessors", []):
        if "bufferView" in acc:
            acc["bufferView"] = view_map[acc["bufferView"]]
        sparse = acc.get("sparse")
        if sparse:
            sparse["indices"]["bufferView"] = view_map[sparse["indices"]["bufferView"]]
            sparse["values"]["bufferView"] = view_map[sparse["values"]["bufferView"]]
    for img in images:
        img["bufferView"] = view_map[img["bufferView"]]

    gltf["bufferViews"] = views
    gltf["buffers"] = [{"byteLength": len(out)}]
    for key, value in (("textures", textures), ("images", images)):
        if value:
            gltf[key] = value
        else:
            gltf.pop(key, None)
    if not textures:
        gltf.pop("samplers", None)
    return gltf, bytes(out)


def main():
    args = sys.argv[sys.argv.index("--") + 1 :]
    if len(args) != 2:
        raise SystemExit("uso: blender -b --python tools/rig/rig_web.py -- <entrada.glb> <salida.glb>")
    src, dst = args
    gltf, binary = read_glb(src)
    gltf, binary = rebuild(gltf, binary)
    write_glb(dst, gltf, binary)
    print(f"RIG_WEB {src} {os.path.getsize(src)} -> {dst} {os.path.getsize(dst)}")


main()
