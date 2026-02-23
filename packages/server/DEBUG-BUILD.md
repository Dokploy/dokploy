# Debug build OOM – orden para probar

Ejecuta desde `packages/server` (o `pnpm --filter=@dokploy/server run <script>` desde la raíz).

1. **`pnpm run build:debug:noEmit`**  
   Solo typecheck, no escribe archivos.  
   - Si hace **OOM** → el problema es el análisis de tipos (ej. zod u otras libs).  
   - Si **pasa** → el problema está en emit (JS o `.d.ts`).

2. **`pnpm run build:debug:noEmit:8gb`**  
   Mismo que el anterior pero con 8GB de heap.  
   - Si con 8GB **pasa** y sin 8GB **no** → el typecheck necesita más memoria.

3. **`pnpm run build:debug:noDecl`**  
   Compila solo JS (sin `declaration`).  
   - Si hace **OOM** → el problema es emitir JS.  
   - Si **pasa** → el problema es generar `.d.ts`.

4. **`pnpm run build:debug:declOnly`**  
   Solo genera declaraciones (`.d.ts`).  
   - Si hace **OOM** → el cuello de botella son las declaraciones.

5. **`pnpm run build:debug:full`**  
   Build completo con `--extendedDiagnostics` (imprime estadísticas al final).  
   - Para ver en qué paso se va la memoria si no has localizado antes.

Con eso sabes si el OOM viene de: typecheck, emit JS o emit declarations, y puedes elegir fix (más memoria, esbuild para JS, o no emitir declarations).
