#!/bin/bash
# Ejecuta rig + diff vs base + QA de la serpiente (salida resumida)
O="/c/Users/ikere/AppData/Local/Temp/claude/D--Workspace-amnesia/8de8afda-0ea6-4ce6-9d06-7aa2a316cda5/scratchpad/agentes/serpiente"
W="C:/Users/ikere/AppData/Local/Temp/claude/D--Workspace-amnesia/8de8afda-0ea6-4ce6-9d06-7aa2a316cda5/scratchpad/agentes/serpiente"
T=/d/Workspace/amnesia/totem
RIG_BAKE_DUMP=$W/serpiente.npz /d/Programas/blender.exe -b --python $T/tools/rig/variantes/rig_serpiente.py -- serpiente $T/assets/serpiente/serpiente.fbx $O/serpiente-rig.glb 2>&1 | grep -E "^OK|Error|Traceback" 
python -I $T/tools/rig/rig_base_diff.py $W serpiente 2>&1 | tail -3
/d/Programas/blender.exe -b --python $T/tools/rig/rig_qa.py -- $W/serpiente-rig.glb $W/qa.json $W/renders 2>&1 | grep -E "^VEREDICTO" | cut -c1-1500
python -I -c "
import json;d=json.load(open('$W/qa.json'))
print(list(d.keys())[:5])
"
