---
description: Ejecuta la Definition of Done completa y sella la verificación
allowed-tools: Bash(pnpm:*), Bash(node:*), Read, Grep, Glob
---

Ejecuta la batería completa, en este orden, y **no pares en el primer fallo**: quiero el
cuadro entero, no el primer síntoma.

```
pnpm -r typecheck
pnpm -r test
pnpm -r lint
pnpm --filter @totem/core test:cov
pnpm sim -- --games 500
```

Después, las comprobaciones que ningún comando hace por ti:

```
rg -n "\bas any\b|: any\b" packages/ || echo "sin any"
rg -n "TODO|FIXME" packages/ | rg -v "TODO\(WP-" || echo "todos los TODO tienen destino"
```

Informe: una tabla con cada comando y su resultado (verde/rojo, y el número de tests o el
porcentaje de cobertura). Si algo está rojo, el diagnóstico concreto y el arreglo propuesto,
sin arreglarlo todavía salvo que sea trivial y evidente.

**Solo si TODO está en verde**, sella la verificación:

```
node .claude/hooks/mark-verified.mjs
```

Ese sello es lo que desbloquea el hook de `Stop`. No lo ejecutes con algo en rojo: te lo
saltarías a ti mismo, que es justo lo que el hook existe para impedir.
