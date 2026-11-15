#!/bin/bash
cd /d/Workspace/amnesia/totem
S="C:/Users/ikere/AppData/Local/Temp/claude/D--Workspace-amnesia/8de8afda-0ea6-4ce6-9d06-7aa2a316cda5/scratchpad/agentes/cuervo"
mkdir -p "$S/renders"
RIG_BAKE_DUMP="$S/base.npz" /d/Programas/blender.exe -b --python tools/rig/variantes/rig_cuervo.py -- cuervo assets/cuervo/cuervo.fbx "$S/cuervo-rig.glb" 2>&1 | grep -E "Error|Traceback|OK|line" 
/d/Programas/blender.exe -b --python tools/rig/rig_qa.py -- "$S/cuervo-rig.glb" "$S/qa.json" "$S/renders" 2>&1 | grep -vE "^(Blender|Read|$)" | tail -40

cp "$S/base.npz" "$S/cuervo.npz"; python tools/rig/rig_base_diff.py "$S" cuervo
