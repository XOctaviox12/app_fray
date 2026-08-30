# 🎨 Guía de Diseño Responsivo para FrayHub (iOS/iPad)

**Última actualización:** 28 de agosto de 2026  
**Plataformas:** iPhone (6-16 Pro Max), iPad (Mini a Pro 12.9")  
**Framework:** Ionic 6+ / Angular  
**Tema:** Soft UI/Neumorphism | Naranja + Azul marino

---

## 1. Tokens de Diseño — Paleta y Variables CSS

### Colores Primarios (Soft UI)
```css
:root {
  /* Primarios */
  --color-primary: #FF6B35;        /* Naranja cálido */
  --color-primary-light: #FFB380;  /* Naranja claro (40% transparencia) */
  --color-primary-dark: #E55100;   /* Naranja oscuro (hover) */
  
  /* Secundarios */
  --color-secondary: #1A2F5A;      /* Azul marino profundo */
  --color-secondary-light: #3D5A80;  /* Azul claro */
  --color-secondary-dark: #0F1F3A;  /* Azul muy oscuro (almost black) */
  
  /* Neutros */
  --color-background: #F5F5F5;     /* Gris claro (fondo) */
  --color-surface: #FFFFFF;        /* Blanco (cards, modales) */
  --color-surface-variant: #EFEFEF; /* Gris sutilmente más oscuro */
  --color-on-surface: #1A1A1A;     /* Texto principal */
  --color-on-surface-variant: #666666; /* Texto secundario */
  
  /* Estados */
  --color-success: #4CAF50;
  --color-warning: #FFC107;
  --color-error: #F44336;
  --color-info: #2196F3;
  
  /* Sombras Neumorphism */
  --shadow-light: 0 2px 8px rgba(0, 0, 0, 0.08);
  --shadow-medium: 0 4px 16px rgba(0, 0, 0, 0.12);
  --shadow-heavy: 0 8px 24px rgba(0, 0, 0, 0.15);
  --shadow-inset: inset 0 2px 4px rgba(0, 0, 0, 0.06);
  --shadow-inset-light: inset 0 1px 2px rgba(0, 0, 0, 0.04);
}

/* Dark Mode (opcional para iOS) */
@media (prefers-color-scheme: dark) {
  :root {
    --color-background: #0A0E1A;
    --color-surface: #1A1F2E;
    --color-on-surface: #E8E8E8;
    --color-on-surface-variant: #B0B0B0;
  }
}
```

### Tipografía
```css
/* Fuentes */
:root {
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Helvetica Neue", sans-serif;
  --font-display: "Plus Jakarta Sans", var(--font-sans);
  --font-mono: "Menlo", "Courier New", monospace;
}

/* Estilos de Texto */
h1 {
  font: 800 2.5rem / 1.2 var(--font-display);
  letter-spacing: -0.02em;
  color: var(--color-secondary-dark);
}

h2 {
  font: 700 1.875rem / 1.25 var(--font-display);
  letter-spacing: -0.01em;
  color: var(--color-secondary-dark);
}

h3 {
  font: 600 1.25rem / 1.4 var(--font-display);
  color: var(--color-secondary-dark);
}

.text-body-large {
  font: 400 1.125rem / 1.5 var(--font-sans);
  color: var(--color-on-surface);
}

.text-body-medium {
  font: 400 1rem / 1.5 var(--font-sans);
  color: var(--color-on-surface);
}

.text-body-small {
  font: 400 0.875rem / 1.4 var(--font-sans);
  color: var(--color-on-surface-variant);
}

.text-label-large {
  font: 600 0.875rem / 1.4 var(--font-sans);
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.text-label-small {
  font: 500 0.75rem / 1.3 var(--font-sans);
  letter-spacing: 0.04em;
}
```

---

## 2. Breakpoints Responsivos

FrayHub debe soportar **4 tamaños de dispositivo:**

```css
/* iPhone SE / XS / 12 mini: 375px */
@media (min-width: 375px) {
  /* Base styles para iPhone pequeño */
}

/* iPhone 6-15 Plus / 11/12/13 Pro: 390px - 430px */
@media (min-width: 390px) {
  /* Optimización para iPhone estándar */
}

/* iPad Mini / 7-8": 768px */
@media (min-width: 768px) {
  /* Layout para tablet pequeña */
  /* Usar columnas, sidebar, grid 2-col */
}

/* iPad Air / Pro 10.5-11": 1024px */
@media (min-width: 1024px) {
  /* Layout para tablet grande */
  /* Grid 3-col, master-detail split view */
}

/* iPad Pro 12.9" */
@media (min-width: 1366px) {
  /* Máximo ancho, full desktop experience */
}
```

### Ancho Máximo de Contenido
```css
ion-content {
  --max-width: 100vw; /* iPhone: full width */
}

@media (min-width: 768px) {
  ion-content {
    --max-width: 1024px;
    margin-inline: auto;
  }
}
```

---

## 3. Espaciado Responsivo (Padding/Margin)

Usa **escala modular: 4px → 8px → 12px → 16px → 24px → 32px → 48px**

```css
/* Contenedor base (Ionic page) */
ion-content {
  --padding: 1rem; /* 16px en móvil */
}

@media (min-width: 768px) {
  ion-content {
    --padding: 1.5rem; /* 24px en tablet */
  }
}

@media (min-width: 1024px) {
  ion-content {
    --padding: 2rem; /* 32px en iPad grande */
  }
}

/* Cards / Sections */
.card {
  padding: 1rem;  /* 16px móvil */
  margin-bottom: 1rem;
  border-radius: 12px;
  background: var(--color-surface);
  box-shadow: var(--shadow-light);
}

@media (min-width: 768px) {
  .card {
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }
}

/* Botones */
ion-button {
  --padding-start: 1.5rem;  /* 24px horizontal */
  --padding-end: 1.5rem;
  --padding-top: 0.75rem;   /* 12px vertical */
  --padding-bottom: 0.75rem;
  --border-radius: 10px;
  --box-shadow: var(--shadow-light);
}

@media (min-width: 768px) {
  ion-button {
    --padding-start: 2rem;
    --padding-end: 2rem;
  }
}
```

---

## 4. Componentes Responsivos — Patrones Ionic

### 4.1 Header (Topbar)

**Objetivo:** Responsive header que se ajusta a iPhone X notch, iPad landscape, etc.

```html
<!-- app-component.html -->
<ion-header class="app-header" [class.compact]="isCompactView">
  <ion-toolbar class="toolbar-custom">
    <ion-buttons slot="start">
      <ion-menu-button auto-hide="false"></ion-menu-button>
    </ion-buttons>
    
    <ion-title class="header-title">{{ titulo }}</ion-title>
    
    <!-- Período dinámico (responsive) -->
    <div class="periodo-badge">
      {{ periodoDisplay }}
    </div>
    
    <ion-buttons slot="end">
      <ion-button (click)="abrirNotificaciones()">
        <ion-icon name="notifications-outline"></ion-icon>
        <ion-badge *ngIf="notCount > 0">{{ notCount }}</ion-badge>
      </ion-button>
      <ion-button (click)="abrirPerfil()">
        <ion-icon name="person-circle-outline"></ion-icon>
      </ion-button>
    </ion-buttons>
  </ion-toolbar>
</ion-header>

<style scoped>
.app-header {
  --background: linear-gradient(135deg, var(--color-secondary-dark) 0%, var(--color-secondary) 100%);
  position: sticky;
  top: 0;
  z-index: 100;
}

.toolbar-custom {
  --padding-start: 0.75rem;
  --padding-end: 0.75rem;
  --min-height: 56px;
}

.header-title {
  font-size: 1.125rem;
  font-weight: 700;
  color: white;
}

.periodo-badge {
  display: none; /* Oculto en móvil */
  background: rgba(255, 255, 255, 0.2);
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  margin: 0 auto;
}

@media (min-width: 390px) {
  .periodo-badge {
    display: inline-block;
  }
}

@media (min-width: 768px) {
  .toolbar-custom {
    --min-height: 64px;
  }

  .header-title {
    font-size: 1.25rem;
  }
}

/* iPhone X+ safe area */
@supports (padding: max(0px)) {
  .toolbar-custom {
    padding-left: max(var(--safe-area-inset-left), 0.75rem);
    padding-right: max(var(--safe-area-inset-right), 0.75rem);
  }
}
</style>
```

### 4.2 Sidebar/Menu (Responsive)

```html
<!-- menu-component.html -->
<ion-menu side="start" menuId="main" [isOpen]="false" class="main-menu">
  <ion-header class="menu-header">
    <div class="user-info">
      <img [src]="user.avatar" alt="Avatar" class="user-avatar">
      <div class="user-details">
        <p class="user-name">{{ user.nombre }}</p>
        <p class="user-role">{{ user.rol | uppercase }}</p>
      </div>
    </div>
  </ion-header>
  
  <ion-content>
    <ion-list lines="full">
      <ion-menu-toggle *ngFor="let item of menuItems">
        <ion-item [routerLink]="item.route" routerLinkActive="active">
          <ion-icon [name]="item.icon" slot="start"></ion-icon>
          <ion-label>{{ item.label }}</ion-label>
        </ion-item>
      </ion-menu-toggle>
    </ion-list>
  </ion-content>
  
  <ion-footer class="menu-footer">
    <ion-button expand="block" fill="clear" (click)="logout()">
      <ion-icon name="log-out-outline" slot="start"></ion-icon>
      Salir
    </ion-button>
  </ion-footer>
</ion-menu>

<style scoped>
.main-menu {
  --width: 280px; /* Estándar iOS */
}

@media (min-width: 768px) {
  .main-menu {
    --width: 320px; /* Más ancho en tablet */
  }
}

.menu-header {
  background: linear-gradient(135deg, var(--color-secondary-dark), var(--color-secondary));
  padding: 1.5rem 1rem;
  color: white;
}

.user-info {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.user-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.3);
  box-shadow: var(--shadow-light);
}

.user-details {
  flex: 1;
  min-width: 0;
}

.user-name {
  font-weight: 600;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-role {
  font-size: 0.75rem;
  opacity: 0.8;
  margin: 0.25rem 0 0;
}

ion-item.active {
  --color: var(--color-primary);
  --border-color: var(--color-primary);
}

.menu-footer {
  border-top: 1px solid var(--color-surface-variant);
  padding: 1rem;
}
</style>
```

### 4.3 Grid Responsivo (Tareas, Actividades)

```html
<!-- tareas.page.html -->
<ion-content class="tareas-content">
  <ion-grid class="tareas-grid" fixed>
    <ion-row class="tareas-row">
      <ion-col 
        sizeSm="12"   <!-- 100% en móvil -->
        sizeMd="6"    <!-- 50% en tablet pequeña -->
        sizeLg="4"    <!-- 33% en tablet grande -->
        *ngFor="let tarea of tareas">
        
        <div class="tarea-card" [class.urgente]="tarea.urgente">
          <div class="tarea-header">
            <h3 class="tarea-title">{{ tarea.titulo }}</h3>
            <ion-badge [color]="tarea.estado">{{ tarea.estado }}</ion-badge>
          </div>
          
          <p class="tarea-description">{{ tarea.descripcion }}</p>
          
          <div class="tarea-meta">
            <span class="due-date">
              <ion-icon name="calendar-outline"></ion-icon>
              {{ tarea.fechaVencimiento | date: 'short' }}
            </span>
            <span class="puntuacion">
              {{ tarea.puntos }} pts
            </span>
          </div>
          
          <ion-button expand="block" (click)="abrirTarea(tarea.id)">
            Ver Detalles
          </ion-button>
        </div>
      </ion-col>
    </ion-row>
  </ion-grid>
</ion-content>

<style scoped>
.tareas-grid {
  padding: 1rem 0.75rem;
}

@media (min-width: 768px) {
  .tareas-grid {
    padding: 1.5rem 1rem;
  }
}

.tarea-card {
  background: var(--color-surface);
  border-radius: 12px;
  padding: 1rem;
  box-shadow: var(--shadow-light);
  transition: all 0.3s ease;
  border-left: 4px solid var(--color-secondary);
}

.tarea-card:hover {
  box-shadow: var(--shadow-medium);
  transform: translateY(-2px);
}

.tarea-card.urgente {
  border-left-color: var(--color-error);
}

.tarea-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.tarea-title {
  font: 700 1rem / 1.3 var(--font-display);
  margin: 0;
  flex: 1;
  word-break: break-word;
}

.tarea-description {
  font: 400 0.875rem / 1.4 var(--font-sans);
  color: var(--color-on-surface-variant);
  margin-bottom: 0.75rem;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.tarea-meta {
  display: flex;
  gap: 1rem;
  font-size: 0.75rem;
  color: var(--color-on-surface-variant);
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}

.tarea-meta ion-icon {
  width: 1em;
  height: 1em;
  margin-right: 0.25rem;
  vertical-align: -0.15em;
}
</style>
```

### 4.4 Forms Responsivos

```html
<!-- formulario de login -->
<ion-content class="form-content">
  <div class="form-container">
    <h1 class="form-title">Inicia Sesión</h1>
    
    <form [formGroup]="loginForm" (ngSubmit)="submit()">
      <div class="form-group">
        <ion-label position="floating">Correo Electrónico</ion-label>
        <ion-input 
          type="email" 
          formControlName="email"
          inputmode="email"
          autocomplete="email"
          clearInput>
        </ion-input>
        <small class="error-text" *ngIf="loginForm.get('email')?.invalid">
          Correo inválido
        </small>
      </div>
      
      <div class="form-group">
        <ion-label position="floating">Contraseña</ion-label>
        <ion-input 
          [type]="showPassword ? 'text' : 'password'" 
          formControlName="password"
          autocomplete="password">
        </ion-input>
        <ion-button 
          fill="clear" 
          size="small"
          (click)="togglePassword()"
          slot="end">
          <ion-icon [name]="showPassword ? 'eye-off' : 'eye'"></ion-icon>
        </ion-button>
      </div>
      
      <ion-button 
        expand="block" 
        type="submit"
        [disabled]="!loginForm.valid || loading"
        class="submit-btn">
        <ion-spinner *ngIf="loading" name="crescent"></ion-spinner>
        {{ loading ? 'Ingresando...' : 'Ingresar' }}
      </ion-button>
    </form>
  </div>
</ion-content>

<style scoped>
.form-content {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--color-secondary-dark), var(--color-secondary-light));
}

.form-container {
  width: 100%;
  max-width: 400px;
  padding: 2rem 1.5rem;
  background: var(--color-surface);
  border-radius: 16px;
  box-shadow: var(--shadow-heavy);
  margin: 1rem;
}

.form-title {
  text-align: center;
  margin-bottom: 2rem;
  color: var(--color-secondary-dark);
}

.form-group {
  margin-bottom: 1.5rem;
  position: relative;
}

ion-input {
  --padding-start: 0;
  --padding-end: 0;
  --border-bottom: 1px solid var(--color-surface-variant);
}

ion-input:focus {
  --border-bottom-color: var(--color-primary);
}

.error-text {
  display: block;
  color: var(--color-error);
  font-size: 0.75rem;
  margin-top: 0.25rem;
}

.submit-btn {
  --background: var(--color-primary);
  --background-hover: var(--color-primary-dark);
  --color: white;
  margin-top: 1rem;
}

@media (min-width: 768px) {
  .form-container {
    max-width: 450px;
    padding: 3rem;
  }

  .form-title {
    margin-bottom: 2.5rem;
    font-size: 2rem;
  }
}
</style>
```

---

## 5. Reglas de Seguridad iOS/iPad

### 5.1 Safe Area (iPhone X+, iPad notch)

```css
/* Aplicar safe-area en todos los headers/footers */
ion-header {
  padding-top: max(env(safe-area-inset-top), 0);
}

ion-footer {
  padding-bottom: max(env(safe-area-inset-bottom), 0);
}

/* Si usas custom elements */
.custom-header {
  padding-left: max(env(safe-area-inset-left), 1rem);
  padding-right: max(env(safe-area-inset-right), 1rem);
}
```

### 5.2 Orientación (Portrait/Landscape)

```css
/* Detectar landscape */
@media (orientation: landscape) {
  ion-content {
    --padding: 0.75rem;  /* Menos padding en landscape */
  }

  .header-title {
    font-size: 1rem;  /* Título más pequeño */
  }

  ion-list {
    --padding-start: 0.5rem;
    --padding-end: 0.5rem;
  }
}

/* iPad landscape es más ancho, aprovechar */
@media (min-width: 1024px) and (orientation: landscape) {
  .tareas-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1rem;
  }
}
```

### 5.3 Teclado Virtual (Avoid Keyboard Push-up)

```typescript
// app.component.ts
import { Keyboard } from '@capacitor/keyboard';

export class AppComponent {
  constructor() {
    this.initKeyboard();
  }

  async initKeyboard() {
    // En iOS, mantener posición al abrir teclado
    await Keyboard.setAccessoryBarVisible({ isVisible: false });
  }
}
```

```html
<!-- En formularios: evitar desplazamientos -->
<ion-input 
  [scrollPadding]="false"
  [scrollAssist]="false">
</ion-input>
```

### 5.4 Notch/Dynamic Island (iPhone 14+)

```css
/* Proteger contenido del notch/Dynamic Island */
.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: env(safe-area-inset-top);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}

/* Si tienes elementos en corners */
.corner-badge {
  position: fixed;
  top: env(safe-area-inset-top);
  right: env(safe-area-inset-right);
  z-index: 1000;
}
```

### 5.5 Zoom y Accessible Fonts

```css
/* Permitir zoom de usuario */
html {
  -webkit-user-scalable: yes;
  user-scalable: yes;
}

/* Respetar preferencias de tamaño de fuente del sistema */
:root {
  font-size: clamp(14px, 2.5vw, 18px);
}

/* Mínimo 44px x 44px para botones (accesibilidad touch) */
ion-button {
  --min-height: 44px;
  --min-width: 44px;
}

ion-item {
  --min-height: 44px;
}
```

### 5.6 Dark Mode (opcional pero recomendado)

```css
/* Respetar preferencia del sistema */
@media (prefers-color-scheme: dark) {
  :root {
    --color-background: #0A0E1A;
    --color-surface: #1A1F2E;
    --color-on-surface: #E8E8E8;
    --color-on-surface-variant: #B0B0B0;
  }

  ion-card {
    --background: var(--color-surface);
    --color: var(--color-on-surface);
  }

  /* Sombras más sutiles en dark mode */
  --shadow-light: 0 2px 8px rgba(0, 0, 0, 0.3);
  --shadow-medium: 0 4px 16px rgba(0, 0, 0, 0.4);
}
```

---

## 6. Checklist para Responsividad

### Antes de publicar a App Store:

- [ ] **Pantalla de Login**: Centr, bien separada, visible en iPhone 5s (375px)
- [ ] **Header**: No se corta con notch iPhone X+ / Dynamic Island iPhone 14+
- [ ] **Sidebar**: Abre/cierra correctamente en landscape y portrait
- [ ] **Cards/Grid**: 1 col en móvil, 2 en tablet, 3+ en iPad Pro
- [ ] **Imágenes**: No exceden 1200px ancho (usar Cloudinary resizing)
- [ ] **Textos**: Legibles con font scaling del sistema (no fijar tamaños)
- [ ] **Botones**: Mínimo 44x44px, tapping área sin errores
- [ ] **Formularios**: Labels flotantes, clearInput visible, teclado no cubre campos
- [ ] **Iconos**: Usar Ionicons consistentemente, probar tamaños
- [ ] **Safe Area**: `max(env(safe-area-inset-*), valor-fallback)`
- [ ] **Orientación**: Probar portrait AND landscape en iPhone/iPad
- [ ] **Performance**: LCP < 3s, CLS < 0.1, no scrolling lag
- [ ] **Touch**: Mínimo 8px entre elementos interactivos
- [ ] **Dark Mode**: Probar en Settings > Display > Dark Appearance
- [ ] **Keyboard**: No haga scroll innecesario, inputs accesibles
- [ ] **Zoom**: Usuario puede hacer pinch-to-zoom (no deshabilitar)
- [ ] **Accesibilidad**: ARIA labels, semantic HTML, contrast ratio > 4.5:1

---

## 7. Ejemplos de Implementación

### 7.1 Componente Responsivo Completo (Tarea Card)

```typescript
// tarea-card.component.ts
import { Component, Input, ViewChild, ElementRef } from '@angular/core';

@Component({
  selector: 'app-tarea-card',
  template: `
    <div class="tarea-card" [class.urgente]="tarea.urgente" 
         (click)="handleClick()" 
         #cardEl>
      <div class="tarea-header">
        <h3 class="tarea-title">{{ tarea.titulo }}</h3>
        <ion-badge [color]="getBadgeColor()">{{ tarea.estado }}</ion-badge>
      </div>
      
      <p class="tarea-description">{{ tarea.descripcion }}</p>
      
      <div class="tarea-meta">
        <span class="due-date">
          <ion-icon name="calendar-outline"></ion-icon>
          {{ tarea.fechaVencimiento | date: 'short' }}
        </span>
        <span class="puntuacion">{{ tarea.puntos }} pts</span>
      </div>
      
      <ion-button expand="block" size="small" (click)="abrirDetalles()">
        Ver Detalles
      </ion-button>
    </div>
  `,
  styles: [`
    .tarea-card {
      background: var(--color-surface);
      border-radius: 12px;
      padding: 1rem;
      box-shadow: var(--shadow-light);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      border-left: 4px solid var(--color-secondary);
      cursor: pointer;
      -webkit-user-select: none;
      user-select: none;
    }

    /* Hover effect (desktop) */
    @media (hover: hover) {
      .tarea-card:hover {
        box-shadow: var(--shadow-medium);
        transform: translateY(-2px);
      }
    }

    /* Active state (mobile) */
    .tarea-card:active {
      box-shadow: var(--shadow-light);
      opacity: 0.95;
    }

    .tarea-card.urgente {
      border-left-color: var(--color-error);
      background: linear-gradient(135deg, 
        var(--color-surface) 0%, 
        rgba(244, 67, 54, 0.05) 100%);
    }

    .tarea-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 0.75rem;
      margin-bottom: 0.75rem;
    }

    .tarea-title {
      font: 700 1rem / 1.3 var(--font-display);
      margin: 0;
      flex: 1;
      word-break: break-word;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .tarea-description {
      font: 400 0.875rem / 1.4 var(--font-sans);
      color: var(--color-on-surface-variant);
      margin-bottom: 0.75rem;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .tarea-meta {
      display: flex;
      gap: 1rem;
      font-size: 0.75rem;
      color: var(--color-on-surface-variant);
      margin-bottom: 0.75rem;
      flex-wrap: wrap;
    }

    .tarea-meta ion-icon {
      width: 1em;
      height: 1em;
      margin-right: 0.25rem;
      vertical-align: -0.15em;
    }

    /* Responsive adjustments */
    @media (min-width: 768px) {
      .tarea-card {
        padding: 1.25rem;
      }

      .tarea-title {
        -webkit-line-clamp: 1;
      }

      .tarea-description {
        -webkit-line-clamp: 3;
      }
    }
  `]
})
export class TareaCardComponent {
  @Input() tarea: any;
  @ViewChild('cardEl') cardEl!: ElementRef;

  getBadgeColor() {
    const colors: any = {
      'pendiente': 'warning',
      'entregada': 'success',
      'calificada': 'primary',
      'vencida': 'danger'
    };
    return colors[this.tarea.estado] || 'secondary';
  }

  handleClick() {
    // Haptic feedback en dispositivos que lo soporten
    if (window.navigator && (window.navigator as any).vibrate) {
      (window.navigator as any).vibrate(10);
    }
  }

  abrirDetalles() {
    console.log('Abrir detalles de', this.tarea.id);
  }
}
```

### 7.2 Global Styles (global.scss)

```scss
// global.scss — Estilos base responsivos para FrayHub

/* ===== Variables CSS ===== */
:root {
  // Colores
  --color-primary: #FF6B35;
  --color-primary-light: #FFB380;
  --color-primary-dark: #E55100;
  --color-secondary: #1A2F5A;
  --color-secondary-light: #3D5A80;
  --color-secondary-dark: #0F1F3A;
  
  --color-background: #F5F5F5;
  --color-surface: #FFFFFF;
  --color-surface-variant: #EFEFEF;
  --color-on-surface: #1A1A1A;
  --color-on-surface-variant: #666666;
  
  --color-success: #4CAF50;
  --color-warning: #FFC107;
  --color-error: #F44336;
  --color-info: #2196F3;
  
  // Sombras
  --shadow-light: 0 2px 8px rgba(0, 0, 0, 0.08);
  --shadow-medium: 0 4px 16px rgba(0, 0, 0, 0.12);
  --shadow-heavy: 0 8px 24px rgba(0, 0, 0, 0.15);
  
  // Tipografía
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", sans-serif;
  --font-display: "Plus Jakarta Sans", var(--font-sans);
  
  // Breakpoints
  --bp-xs: 375px;
  --bp-sm: 480px;
  --bp-md: 768px;
  --bp-lg: 1024px;
  --bp-xl: 1366px;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  :root {
    --color-background: #0A0E1A;
    --color-surface: #1A1F2E;
    --color-on-surface: #E8E8E8;
    --color-on-surface-variant: #B0B0B0;
    --shadow-light: 0 2px 8px rgba(0, 0, 0, 0.3);
  }
}

/* ===== Reset ===== */
* {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
  font-family: var(--font-sans);
  background: var(--color-background);
  color: var(--color-on-surface);
  overflow-x: hidden;
  
  -webkit-user-scalable: yes;
  user-scalable: yes;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
}

/* ===== Ionic Customization ===== */
ion-content {
  --background: var(--color-background);
  --padding: 1rem;
  --padding-start: 1rem;
  --padding-end: 1rem;
  --padding-top: 1rem;
  --padding-bottom: 1rem;
}

@media (min-width: 768px) {
  ion-content {
    --padding: 1.5rem;
  }
}

ion-card {
  --background: var(--color-surface);
  --color: var(--color-on-surface);
  box-shadow: var(--shadow-light);
  border-radius: 12px;
}

ion-button {
  --box-shadow: var(--shadow-light);
  --padding-start: 1.5rem;
  --padding-end: 1.5rem;
  --padding-top: 0.75rem;
  --padding-bottom: 0.75rem;
  --border-radius: 10px;
  --min-height: 44px;
  --transition: all 0.3s ease;
}

ion-button:active {
  --box-shadow: var(--shadow-light);
  opacity: 0.95;
}

ion-input {
  --padding-start: 0;
  --padding-end: 0;
  --border-bottom: 1px solid var(--color-surface-variant);
}

ion-input:focus {
  --border-bottom-color: var(--color-primary);
}

/* ===== Utilidades ===== */
.text-center { text-align: center; }
.text-start { text-align: start; }
.text-end { text-align: end; }

.flex-center { display: flex; align-items: center; justify-content: center; }
.flex-between { display: flex; justify-content: space-between; align-items: center; }

.mt-1 { margin-top: 0.5rem; }
.mt-2 { margin-top: 1rem; }
.mt-3 { margin-top: 1.5rem; }
.mt-4 { margin-top: 2rem; }

.mb-1 { margin-bottom: 0.5rem; }
.mb-2 { margin-bottom: 1rem; }
.mb-3 { margin-bottom: 1.5rem; }
.mb-4 { margin-bottom: 2rem; }

/* ===== Safe Area ===== */
@supports (padding: max(0px)) {
  ion-header {
    padding-top: max(env(safe-area-inset-top), 0);
  }
  
  ion-footer {
    padding-bottom: max(env(safe-area-inset-bottom), 0);
  }
}

/* ===== Orientación ===== */
@media (orientation: landscape) {
  ion-content {
    --padding: 0.75rem;
  }
  
  ion-toolbar {
    --min-height: 48px;
  }
}

/* ===== Accessibility ===== */
@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
  }
}

/* ===== Print ===== */
@media print {
  ion-header, ion-footer, ion-menu {
    display: none;
  }
}
```

---

## 8. Performance Checklist

- **Bundle size**: < 500KB gzipped (incluir deps)
- **TTI (Time to Interactive)**: < 3.5s en 4G
- **LCP (Largest Contentful Paint)**: < 2.5s
- **CLS (Cumulative Layout Shift)**: < 0.1
- **Imágenes**: Usar AVIF/WebP con fallback JPG, resizing en Cloudinary
- **Code splitting**: Lazy load rutas con Angular, no cargar todo
- **Minified CSS/JS**: Habilitado en prod
- **Service Workers**: Caché de assets estáticos
- **Fonts**: Usar `font-display: swap` en @import
- **Animations**: GPU-accelerated (transform, opacity)

---

## 9. Testing en Dispositivos Reales

### iOS
1. **Simulator**: Xcode → Simulator → iPhone 14, iPhone 14 Pro Max, iPad Pro
2. **Real Device**: Conectar iPhone/iPad a Mac, run en Xcode
3. **Safari DevTools**: Conectar iPad a Mac, inspeccionar elementos

### Android
1. **Emulator**: Android Studio → crear AVD con diferentes tamaños
2. **Real Device**: Conectar vía ADB, abrir app
3. **Chrome DevTools**: Remote debugging vía USB

### Automatizado
```bash
# Lighthouse Audits
npm install -g lighthouse
lighthouse https://your-app.com --output-path=report.html

# Capacitor testing
ionic serve --lab  # Browser simulation
```

---

## 10. Recursos y Referencias

- **Apple HIG** (Human Interface Guidelines): https://developer.apple.com/design/human-interface-guidelines/
- **Material Design 3** (Android): https://m3.material.io/
- **Ionic Documentation**: https://ionicframework.com/docs
- **MDN Responsive**: https://developer.mozilla.org/en-US/docs/Learn/CSS/CSS_layout/Responsive_Design
- **Web Vitals**: https://web.dev/vitals/
- **Capacitor**: https://capacitorjs.com/docs/apis
- **Safe Area Guide**: https://webkit.org/blog/7929/designing-websites-for-iphone-x/

---

**Última actualización:** 28 de agosto de 2026  
**Versión:** 1.0 — Guía responsiva completa para FrayHub iOS/iPad
