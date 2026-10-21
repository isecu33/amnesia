## WP y objetivo

<!-- WP-NN · qué existe al terminar que hoy no existe, en 1-3 frases. -->

## Criterios de aceptación

<!-- Copiados de la ficha del WP en docs/03 §5. Marca solo lo que has verificado. -->

- [ ] 
- [ ] 
- [ ] `pnpm -r typecheck && pnpm -r test && pnpm -r lint` en verde

## Verificación (pega la salida, no la resumas)

```
```

## Self-review

- [ ] Casos **E** aplicables cubiertos con test nombrado (`describe('E13 · …')`)
- [ ] Invariantes **I** aplicables repasados; si toqué vistas o eventos, **I2** revisado a mano
- [ ] Vocabulario canónico: no he inventado sinónimos de conceptos que ya tienen nombre
- [ ] Cero `any`, cero strings hardcodeados, cero números mágicos fuera de `config.ts`
- [ ] Todo `TODO` lleva su WP de destino
- [ ] Si cambié una regla, **actualicé el doc primero**
- [ ] Si cambié la forma de un mensaje, bump de `PROTOCOL_VERSION`
- [ ] Entrada en `docs/decisiones.md` si tomé una decisión que los docs no cubrían

## Deudas que dejo

<!-- Cada una con su WP de destino. Si no hay, escribe "ninguna". -->
