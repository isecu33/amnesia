# Genera y valida los rigs de los animales en una carpeta de salida (no toca assets/).
# Uso: powershell -File tools/rig/rig_all.ps1 -Out <carpeta> [-Animals oso,zorro] [-Blender <ruta>] [-QaOnly]
# -QaOnly valida los GLB de assets/ tal como están (referencia "antes").
param(
  [Parameter(Mandatory = $true)][string]$Out,
  [string[]]$Animals = @('oso', 'zorro', 'ciervo', 'serpiente', 'buho', 'cuervo'),
  [string]$Blender = 'D:\Programas\blender.exe',
  [switch]$QaOnly
)
$ErrorActionPreference = 'Continue'   # Blender escribe avisos en stderr; los errores reales se filtran abajo
$Animals = $Animals | ForEach-Object { $_ -split ',' }   # con -File, "a,b" llega como un solo texto
New-Item -ItemType Directory -Force $Out | Out-Null
$fail = 0
foreach ($a in $Animals) {
  $glb = if ($QaOnly) { "assets/$a/$a-rig.glb" } else { Join-Path $Out "$a-rig.glb" }
  if (-not $QaOnly) {
    & $Blender -b --python tools/rig/rig_animal.py -- $a "assets/$a/$a.fbx" $glb 2>&1 |
      Select-String 'Traceback|Error' | ForEach-Object { "${a} RIG: $_" }
  }
  & $Blender -b --python tools/rig/rig_qa.py -- $glb (Join-Path $Out "$a.json") (Join-Path $Out 'renders') 2>&1 | Out-Null
  $j = Get-Content (Join-Path $Out "$a.json") -Raw | ConvertFrom-Json
  if ($j.verdict -ne 'PASS') { $fail++ }
  "${a}: $($j.verdict)"
  foreach ($p in $j.actions.PSObject.Properties) {
    $m = $p.Value
    '  {0,-12} malas {1,5:N2}%  crece {2,4:N1} cm  pliegue {3,5:N2}%  suelo {4,5:N2} m  tirón {5,6:N0}°/s²' -f `
      ($p.Name -replace '_Armature', ''), ($m.bad_edge_frac * 100), $m.max_growth_cm, ($m.fold_frac * 100), $m.min_z, $m.accel
  }
  $j.issues | Where-Object level -eq 'FAIL' | ForEach-Object { "  FAIL $($_.action): $($_.what)" }
}
exit $fail
