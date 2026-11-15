#!/bin/bash
cd /d/Workspace/amnesia/totem
S=/c/Users/ikere/AppData/Local/Temp/claude/D--Workspace-amnesia/8de8afda-0ea6-4ce6-9d06-7aa2a316cda5/scratchpad/agentes/cuervo
bash tools/rig/variantes/cuervo_run.sh > "$S/run.log" 2>&1
cp "$S/cuervo-rig.glb" assets/cuervo/cuervo-rig.cand.glb
node tools/rig/rig_browser_shots.mjs cuervo "$(cygpath -m $S)/nav" cand > "$S/shots.log" 2>&1
echo FIN > "$S/fin.txt"
