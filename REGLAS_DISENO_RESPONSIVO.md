# 📋 Reglas de Diseño Responsivo — Para Implementar en Otros Componentes

**Versión:** 1.0  
**Fecha:** 28 de agosto de 2026  
**Aplicable a:** FrayHub (Ionic/Angular)  
**Objetivo:** Estandarizar responsividad en toda la app

---

## 🎯 Reglas Fundamentales

### Regla 1: Siempre usar 5 Breakpoints
```scss
// Los 5 breakpoints OBLIGATORIOS en TODOS los componentes
@media (min-width: 375px)  { }  // iPhone SE
@media (min-width: 390px)  { }  // iPhone estándar
@media (min-width: 768px)  { }  // iPad Mini
@media (min-width: 1024px) { }  // iPad Air
@media (min-width: 1366px) { }  // iPad Pro
```

**Por qué:**
- 375px → iPhone SE es el móvil más pequeño soportado
- 390px → iPhone estándar (mayoría de usuarios iOS)
- 768px → iPad Mini (primer tablet breakpoint)
- 1024px → iPad Air (tablet media)
- 1366px → iPad Pro 12.9" (máximo aprovechamiento)

**Aplicar en:**
- ✅ Padding/Margin
- ✅ Font-size
- ✅ Grid/Flex columnas
- ✅ Ancho máximo

---

### Regla 2: Padding Adaptativo (NO Valores Fijos)

#### ❌ INCORRECTO (Valor fijo)
```scss
.componente {
  padding: 20px;  // Igual en todo → Apretado en móvil, sobra espacio en iPad
}
```

#### ✅ CORRECTO (Adaptativo)
```scss
.componente {
  padding: 12px;                // iPhone SE (mínimo)
  
  @media (min-width: 390px) {
    padding: 16px;              // iPhone estándar
  }
  
  @media (min-width: 768px) {
    padding: 24px;              // iPad
  }
  
  @media (min-width: 1024px) {
    padding: 32px;              // iPad grande
  }
}
```

**Escala de padding recomendada:**
```
iPhone SE:      12px  (mínimo absoluto)
iPhone+:        16px  (cómodo)
iPad:           24px  (normal)
iPad Pro:       32px  (máximo)
```

**Aplicar en:**
- ✅ `padding` (contenedores, cards, hero)
- ✅ `margin` (gaps entre secciones)
- ✅ `gap` (flexbox/grid)

---

### Regla 3: Tipografía Escalada (NO Font-size Único)

#### ❌ INCORRECTO (Tamaño fijo)
```scss
h1 { font-size: 24px; }  // Pequeño en iPhone, bien en iPad
p  { font-size: 14px; }  // Pequeño en iPhone, bien en iPad
```

#### ✅ CORRECTO (Escalada progresiva)
```scss
h1 {
  font-size: 20px;              // iPhone SE
  @media (min-width: 390px) { font-size: 21px; }
  @media (min-width: 768px) { font-size: 24px; }
}

p {
  font-size: 13px;              // iPhone SE
  @media (min-width: 390px) { font-size: 14px; }
  @media (min-width: 768px) { font-size: 15px; }
}
```

**Incrementos recomendados:**
- iPhone SE → iPhone+: +0-1px (pequeño)
- iPhone+ → iPad: +2-4px (notable)
- iPad → iPad Pro: +0-2px (fino ajuste)

**Aplicar en:**
- ✅ Encabezados (h1, h2, h3)
- ✅ Números grandes (métricas, contadores)
- ✅ Labels/etiquetas
- ✅ Body text (cuando sea crítico)

---

### Regla 4: Grid Responsivo (Columnas Dinámicas)

#### ❌ INCORRECTO (Mismas columnas siempre)
```scss
.grid {
  grid-template-columns: repeat(4, 1fr);  // 4 columnas en iPhone → Apretado
}
```

#### ✅ CORRECTO (Columnas adaptativas)
```scss
.grid {
  // iPhone: 2 columnas
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  
  // iPad: 4 columnas
  @media (min-width: 768px) {
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
  }
}
```

**Patrones recomendados:**
```
iPhone SE/+:    1 col (full width)
                2 col (si son pequeñas)

iPad Mini:      2-3 col

iPad Air:       3-4 col

iPad Pro:       4-6 col
```

**Aplicar en:**
- ✅ Cards (tareas, asistencia, listas)
- ✅ Métricas/KPIs
- ✅ Grillas de datos
- ✅ Listados

---

### Regla 5: Flexbox Responsivo (Direction por Breakpoint)

#### ❌ INCORRECTO (Mismo layout siempre)
```scss
.card {
  display: flex;
  flex-direction: row;  // Horizontal en móvil pequeño → Apretado
  gap: 18px;
}
```

#### ✅ CORRECTO (Dirección adaptativa)
```scss
.card {
  // iPhone: Vertical stacked
  display: flex;
  flex-direction: column;
  gap: 16px;
  
  // iPhone+ (480px+): Horizontal si hay espacio
  @media (min-width: 480px) {
    flex-direction: row;
    gap: 18px;
  }
}
```

**Patrones recomendados:**
```
iPhone SE/390px:    flex-direction: column (vertical)
iPhone 480px+:      flex-direction: row (horizontal)
iPad 768px+:        flex-direction: row (horizontal)
```

**Aplicar en:**
- ✅ Cards con icono + texto
- ✅ Cards con gauge + breakdown
- ✅ Header + contenido
- ✅ Formularios

---

### Regla 6: Máximo Ancho Centrado (iPad Tablets)

#### ❌ INCORRECTO (Sin máximo ancho)
```scss
.contenedor {
  width: 100%;  // En iPad Pro (1366px), ocupa 1366px → Demasiado ancho
}
```

#### ✅ CORRECTO (Máximo ancho + centrado)
```scss
.contenedor {
  // Móvil: sin máximo
  width: 100%;
  padding: 0 16px;
  
  // iPad: máximo ancho + centrado
  @media (min-width: 768px) {
    max-width: 780px;
    margin-left: auto;
    margin-right: auto;
  }
  
  // iPad Pro: máximo ancho mayor
  @media (min-width: 1024px) {
    max-width: 1200px;
  }
}
```

**Valores recomendados:**
```
iPhone:         100% (full width)
iPad Mini:      780px (cómodo)
iPad Air:       920px (spacious)
iPad Pro:       1200px (máximo)
```

**Aplicar en:**
- ✅ Contenedores principales
- ✅ Secciones de contenido
- ✅ Grillas
- ✅ Listas largas

---

### Regla 7: Tamaños de Componentes Escalados

#### ❌ INCORRECTO (Tamaño fijo)
```scss
.avatar {
  width: 36px;   // Igual en iPhone y iPad
  height: 36px;
}

.toolbar {
  --min-height: 56px;  // Igual en iPhone y iPad
}
```

#### ✅ CORRECTO (Tamaño adaptativo)
```scss
.avatar {
  width: 32px;                // iPhone
  height: 32px;
  
  @media (min-width: 768px) {
    width: 36px;              // iPad
    height: 36px;
  }
}

.toolbar {
  --min-height: 56px;         // iPhone
  
  @media (min-width: 768px) {
    --min-height: 64px;       // iPad
  }
}
```

**Escala de componentes:**

| Componente | iPhone | iPad |
|---|---|---|
| Avatar pequeño | 28px | 32px |
| Avatar normal | 32px | 36px |
| Avatar grande | 40px | 48px |
| Icono pequeño | 16px | 20px |
| Icono normal | 20px | 24px |
| Icono grande | 24px | 28px |
| Toolbar | 56px | 64px |
| Gauge circular | 72px | 80px |
| Button height | 44px | 48px |

**Aplicar en:**
- ✅ Avatares
- ✅ Iconos
- ✅ Botones
- ✅ Gauges/SVG circulares
- ✅ Toolbar/Header

---

## 👨‍💼 Reglas de Accesibilidad (ARIA)

### Regla 8: Siempre Agregar ARIA Labels

#### ❌ INCORRECTO (Sin labels)
```html
<div class="metrics-row">
  <div class="metric-card">
    <span class="metric-num">25</span>
  </div>
</div>
```

#### ✅ CORRECTO (Con ARIA)
```html
<div class="metrics-row" role="region" aria-label="Métricas rápidas">
  <div class="metric-card">
    <span class="metric-num">25</span>
    <span class="metric-lbl">Alumnos</span>
  </div>
</div>
```

**ARIA Roles obligatorios:**
```html
<!-- Secciones -->
<div role="region" aria-label="Descripción">

<!-- Listas -->
<div role="list">
  <div role="listitem">

<!-- Progress/Barras -->
<div role="progressbar" aria-valuenow="75" aria-valuemin="0" aria-valuemax="100">

<!-- Estados -->
<div role="status" aria-live="polite">   <!-- Cargando -->
<div role="alert">                        <!-- Error -->
<div role="presentation">                 <!-- Solo visual -->
```

**Aplicar en:**
- ✅ Todas las secciones (role="region")
- ✅ Todas las listas (role="list" + role="listitem")
- ✅ Todas las barras de progreso (role="progressbar")
- ✅ Estados de carga/error (role="status", role="alert")

---

### Regla 9: Labels Descriptivos en Todo

#### ❌ INCORRECTO (Sin etiquetas)
```html
<div class="metric-card">
  <span>25</span>
</div>
```

#### ✅ CORRECTO (Con label descriptor)
```html
<div class="metric-card">
  <span class="metric-num">25</span>
  <span class="metric-lbl">Alumnos</span>
  <!-- O con aria-label -->
  <div aria-label="25 alumnos registrados">
```

**Aplicar en:**
- ✅ Números/métricas (label debajo o aria-label)
- ✅ Iconos (aria-hidden + label alternativo)
- ✅ Botones (text o aria-label)
- ✅ Cards (aria-label describiendo contenido)

---

## 🎨 Reglas de Tema (Dark Mode)

### Regla 10: Soportar Dark Mode

#### ❌ INCORRECTO (Sin dark mode)
```scss
.elemento {
  background: #FFFFFF;
  color: #1F2937;
  // Igual en light y dark
}
```

#### ✅ CORRECTO (Con dark mode)
```scss
.elemento {
  background: #FFFFFF;      // Light
  color: #1F2937;
  
  @media (prefers-color-scheme: dark) {
    background: #1A1F2E;    // Dark
    color: #E8E8E8;
  }
}
```

**Escala de colores dark:**
```
Fondo principal:    #0A0E1A   (casi negro)
Cards/Surface:      #1A1F2E   (gris oscuro)
Texto principal:    #E8E8E8   (blanco suave)
Texto secundario:   #A8A8A8   (gris medio)
Borde/Divider:      #2A2F3E   (gris más oscuro)
```

**Aplicar en:**
- ✅ Background
- ✅ Text color
- ✅ Borders
- ✅ Box-shadow
- ✅ Gradientes

---

### Regla 11: Respetar Preferencia de Animación

#### ❌ INCORRECTO (Animaciones obligatorias)
```scss
.elemento {
  animation: slide 0.3s ease;
  transition: all 0.2s ease;
  // Se anima siempre, molesta a usuarios
}
```

#### ✅ CORRECTO (Respeto a preferencias)
```scss
.elemento {
  animation: slide 0.3s ease;
  transition: all 0.2s ease;
}

@media (prefers-reduced-motion: reduce) {
  .elemento {
    animation: none !important;
    transition: none !important;
  }
}
```

**Aplicar en:**
- ✅ Todas las animaciones
- ✅ Todas las transiciones
- ✅ Transform animations

---

## 🍎 Reglas de iOS Específico

### Regla 12: Respetar Safe Area (Notch + Home Indicator)

#### ❌ INCORRECTO (Sin safe area)
```scss
ion-header {
  padding-top: 0;
  // Contenido queda bajo el notch en iPhone 12+
}
```

#### ✅ CORRECTO (Con safe area)
```scss
@supports (padding: max(0px)) {
  ion-header {
    padding-top: max(env(safe-area-inset-top), 0);
  }
  
  ion-footer {
    padding-bottom: max(env(safe-area-inset-bottom), 0);
  }
}
```

**Aplicar en:**
- ✅ ion-header (padding-top)
- ✅ ion-footer (padding-bottom)
- ✅ Elementos flotantes (position: fixed)

---

### Regla 13: Optimizar para Landscape

#### ❌ INCORRECTO (Landscape igual que retrato)
```scss
// Padding igual en retrato y landscape
.elemento { padding: 16px; }
```

#### ✅ CORRECTO (Landscape compacto)
```scss
.elemento {
  padding: 16px;  // Retrato
}

@media (orientation: landscape) and (max-height: 600px) {
  .elemento {
    padding: 8px;  // Landscape compacto
  }
}
```

**Aplicar en:**
- ✅ Padding/margin (reducir en landscape)
- ✅ Toolbar (--min-height compacto)
- ✅ Header spacing

---

## 🔄 Reglas de Patrones CSS

### Regla 14: Usar CSS Variables (NO Valores Hardcoded)

#### ❌ INCORRECTO (Valores repetidos)
```scss
.card1 { background: #FFFFFF; }
.card2 { background: #FFFFFF; }
.card3 { background: #FFFFFF; }
```

#### ✅ CORRECTO (CSS Variables)
```scss
:host {
  --card-bg: #FFFFFF;
  --card-border: #E5E7EB;
  --orange: #F57C00;
}

.card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  color: var(--orange);
}
```

**Aplicar en:**
- ✅ Colores (define en :host)
- ✅ Espaciado (padding, margin)
- ✅ Tipografía (font-family, font-size)
- ✅ Sombras (box-shadow)

---

### Regla 15: Organizar SCSS en Secciones Claras

#### ✅ ESTRUCTURA RECOMENDADA
```scss
// ─ IMPORTS ──────────────────────────
@import "src/theme/variables";

// ─ OVERRIDE LOCAL DE PALETA ────────
:host {
  --color: value;
}

// ─ HEADER ──────────────────────────
.header { }
.header-title { }

// ─ CONTENT ─────────────────────────
.content { }

// ─ COMPONENTES ─────────────────────
.card { }
.metric { }
.avatar { }

// ─ RESPONSIVO TABLET ───────────────
@media (min-width: 768px) {
  // Cambios para tablet
}

// ─ RESPONSIVO IPAD GRANDE ──────────
@media (min-width: 1024px) {
  // Cambios para iPad
}

// ─ DARK MODE ────────────────────────
@media (prefers-color-scheme: dark) {
  // Cambios para dark
}

// ─ ACCESIBILIDAD ────────────────────
@media (prefers-reduced-motion: reduce) {
  // Sin animaciones
}
```

**Aplicar en:**
- ✅ Todos los componentes .scss

---

## ✅ Checklist de Implementación

Al crear un nuevo componente responsivo:

### CSS (SCSS)

- [ ] ¿Tiene 5 breakpoints? (375, 390, 768, 1024, 1366px)
- [ ] ¿Padding escalado? (12px → 32px)
- [ ] ¿Tipografía escalada? (font-size en múltiples breakpoints)
- [ ] ¿Grid/Flex responsivo? (columnas/dirección cambia)
- [ ] ¿Máximo ancho en tablets? (max-width: 780px/1200px)
- [ ] ¿Dark mode? (@media prefers-color-scheme: dark)
- [ ] ¿Safe area? (@supports padding: max)
- [ ] ¿Reduced motion? (@media prefers-reduced-motion: reduce)
- [ ] ¿Orientación landscape? (@media orientation: landscape)
- [ ] ¿CSS variables para colores? (:host)
- [ ] ¿Sin valores hardcoded? (padding, colors en variables)
- [ ] ¿box-sizing: border-box en *?
- [ ] ¿Organización SCSS clara? (imports, secciones comentadas)

### HTML

- [ ] ¿ARIA roles en secciones? (role="region")
- [ ] ¿ARIA roles en listas? (role="list", role="listitem")
- [ ] ¿ARIA roles en progress? (role="progressbar", aria-valuenow)
- [ ] ¿ARIA labels descriptivos? (aria-label="...")
- [ ] ¿Roles en estados? (role="status", role="alert")
- [ ] ¿Alt text en imágenes? (alt="Descripción")
- [ ] ¿Aria-hidden en decorativos? (aria-hidden="true")

### Testing

- [ ] ¿Testeado en iPhone SE (375px)?
- [ ] ¿Testeado en iPhone 14 (390px)?
- [ ] ¿Testeado en iPhone Plus (430px)?
- [ ] ¿Testeado en iPad Mini (768px)?
- [ ] ¿Testeado en iPad Air (1024px)?
- [ ] ¿Testeado en iPad Pro 12.9" (1366px)?
- [ ] ¿Testeado en landscape?
- [ ] ¿Dark mode funciona?
- [ ] ¿Screen reader funciona (VoiceOver)?
- [ ] ¿Lighthouse score > 90?

---

## 📚 Referencia Rápida de Reglas

| Regla | Aplica a | Ejemplo |
|---|---|---|
| 1 | Todos | Usar 5 breakpoints |
| 2 | Padding/Margin | 12px → 32px escalado |
| 3 | Tipografía | font-size en breakpoints |
| 4 | Cards/Grillas | 2 col → 4 col |
| 5 | Cards/Contenedores | flex-direction: column → row |
| 6 | Contenedores | max-width: 780px/1200px + centrado |
| 7 | Componentes | Avatares, iconos, toolbar |
| 8 | HTML | Agregar role + aria-label |
| 9 | HTML | Label en cada métrica/botón |
| 10 | Colores | @media prefers-color-scheme: dark |
| 11 | Animaciones | @media prefers-reduced-motion: reduce |
| 12 | Header/Footer | @supports padding: max (safe-area) |
| 13 | Layout | @media orientation: landscape |
| 14 | Variables | :host { --color: value } |
| 15 | Organización | Secciones comentadas en SCSS |

---

## 🚀 Implementación Paso a Paso

### Para un componente nuevo:

1. **Copiar estructura base**
   ```scss
   @import "src/theme/variables";
   
   :host {
     --color-bg: #FFFFFF;
   }
   
   // Breakpoints obligatorios
   @media (min-width: 375px) { }
   @media (min-width: 390px) { }
   @media (min-width: 768px) { }
   @media (min-width: 1024px) { }
   ```

2. **Agregar ARIA en HTML**
   ```html
   <div role="region" aria-label="Descripción">
     <div role="list">
       <div role="listitem">Item</div>
     </div>
   </div>
   ```

3. **Aplicar reglas de padding/font-size**
   - Padding: 12px → 16px → 24px → 32px
   - Font-size: Escalar en breakpoints

4. **Hacer grid/flex responsivo**
   - 1-2 col en móvil
   - 3-4 col en tablet

5. **Agregar dark mode**
   - @media prefers-color-scheme: dark

6. **Agregar safe area + landscape**
   - @supports padding: max
   - @media orientation: landscape

7. **Testear en todos los dispositivos**
   - Xcode Simulator
   - Safari DevTools
   - Lighthouse

---

## 💡 Tips y Mejores Prácticas

### 1. Usar `rem` en lugar de `px` (cuando sea escalable)
```scss
// Mejor escalabilidad
.elemento { padding: 1rem; }  // vs padding: 16px
```

### 2. Usar CSS Grid para layouts complejos
```scss
// Mejor que flexbox para layouts 2D
display: grid;
grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
```

### 3. Usar `clamp()` para tipografía fluida (CSS 4)
```scss
// Font size que escala automáticamente
font-size: clamp(14px, 2vw, 24px);
```

### 4. Usar `@supports` para features opcionales
```scss
@supports (gap: 1rem) {
  // CSS Grid gap soportado
  gap: 1rem;
}
```

### 5. Usar `:is()` para selectores complejos
```scss
// Menos especificidad
:is(.card, .section) {
  padding: 1rem;
}
```

---

## 🔍 Validación Final

Antes de marcar como "completo":

```bash
# 1. ESLint (SCSS)
npm run lint

# 2. Lighthouse
lighthouse https://your-app.local

# 3. Axe DevTools (Accesibilidad)
# Instalar extensión Chrome: axe DevTools

# 4. Xcode Simulator
xcrun simctl launch booted com.app

# 5. Prueba manual en iPad real
# VoiceOver activado
```

---

**Última actualización:** 28 de agosto de 2026  
**Versión:** 1.0 — Reglas Oficiales de Diseño Responsivo FrayHub  
**Estado:** Listo para implementación en todos los componentes
