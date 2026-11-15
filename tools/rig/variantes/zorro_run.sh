#!/bin/bash
# uso: zorro_run.sh <dir_salida> [qa]   (rig + diff por region [+ rig_qa])
R=/d/Workspace/amnesia/totem/tools/rig; O=$1; mkdir -p $O
W() { cygpath -w "$1"; }
RIG_BAKE_DUMP="$(W $O)\zorro.npz" /d/Programas/blender.exe -b --python $(W $R/variantes/rig_zorro.py) -- zorro D:/Workspace/amnesia/totem/assets/zorro/zorro.fbx "$(W $O)\zorro-rig.glb" 2>&1 | grep -E "Error|Traceback|OK|rror" | head
python $(W $R/variantes/zorro_diff.py) "$(W $O)\zorro.npz"
python $(W $R/rig_base_diff.py) "$(W $O)" zorro | head -3
if [ "$2" = "qa" ]; then
 /d/Programas/blender.exe -b --python $(W $R/rig_qa.py) -- "$(W $O)\zorro-rig.glb" "$(W $O)\qa.json" "$(W $O)\renders" 2>&1 | grep -E "PASS|FAIL|WARN|coger|mirar|reposo" | head -40
fi
