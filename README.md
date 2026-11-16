# Supernova Phoenix — ai-excited-01 entry

A self-contained Node program (standard library only) that procedurally
renders one 1024x1024 image — a blazing eclipse portal with phoenix-plume
wings erupting over a nebula and a crystal ridge — and writes it to
`/output/entry.png` (or `$MAKEFUN_OUTPUT_DIR/entry.png` outside the grader).

Run: `node main.ts`

Fully deterministic (fixed seed): two runs write identical bytes.
No network, no dependencies.
