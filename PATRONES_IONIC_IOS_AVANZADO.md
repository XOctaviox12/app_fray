# 🔧 Patrones Avanzados: Ionic/Angular para iOS/iPad

**Para FrayHub — Problemas comunes y soluciones probadas**

---

## 1. Problemas Comunes en iOS y Cómo Resolverlos

### 1.1 Teclado Virtual Cubriendo Inputs

**Problema:** En iPhone, el teclado virtual cubre el input que el usuario está escribiendo.

**Solución:**

```typescript
// app.component.ts
import { Keyboard } from '@capacitor/keyboard';
import { Platform } from '@ionic/angular';

export class AppComponent {
  constructor(private platform: Platform) {
    this.initKeyboard();
  }

  async initKeyboard() {
    if (this.platform.is('ios')) {
      // iOS: Hacer scroll automático al input cuando aparece teclado
      await Keyboard.setScroll({ isEnabled: true });
    }
  }
}
```

```html
<!-- En formularios críticos -->
<ion-input 
  #emailInput
  type="email"
  formControlName="email"
  (ionFocus)="onInputFocus($event)"
  [scrollPadding]="true"
  [scrollAssist]="true">
</ion-input>
```

```typescript
// tarea-form.component.ts
onInputFocus(event: any) {
  const input = event.target as HTMLInputElement;
  setTimeout(() => {
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 300); // Delay para iOS
}
```

### 1.2 Notch/Safe Area Cortando Contenido

**Problema:** En iPhone X+, el contenido se corta con el notch o se superpone.

**Solución — Versión Correcta:**

```css
/* No hacer esto ❌ */
.header {
  padding-top: 40px; /* Valor hardcoded */
}

/* Hacer esto ✅ */
.header {
  padding-top: env(safe-area-inset-top);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}

/* Con fallback para navegadores antiguos */
@supports (padding: max(0px)) {
  .header {
    padding-top: max(env(safe-area-inset-top), 1rem);
    padding-left: max(env(safe-area-inset-left), 1rem);
    padding-right: max(env(safe-area-inset-right), 1rem);
  }
}
```

### 1.3 Scrolling Lag / Jank en iPad

**Problema:** Scroll no fluido (especialmente con mucho contenido).

**Solución:**

```css
/* Usar GPU acceleration */
.scrollable-container {
  -webkit-overflow-scrolling: touch;  /* iOS momentum scrolling */
  transform: translateZ(0);           /* Force GPU layer */
  backface-visibility: hidden;        /* Optimizar rendering */
}

/* En componentes con *ngFor largo */
.item-list {
  contain: layout style paint;  /* CSS containment para perf */
}
```

```typescript
// tareas.component.ts — Usar OnPush change detection + virtual scroll
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IonVirtualScroll } from '@ionic/angular';

@Component({
  selector: 'app-tareas',
  template: `
    <ion-virtual-scroll 
      [items]="tareas$ | async"
      approxItemHeight="200px">
      <app-tarea-card 
        *ngFor="let tarea of tareas$ | async" 
        [tarea]="tarea">
      </app-tarea-card>
    </ion-virtual-scroll>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TareasComponent {}
```

### 1.4 Botones No Responden al Tap

**Problema:** En iPhone, algunos botones son difíciles de tocar o no responden.

**Solución:**

```css
/* Mínimo 44x44px de área táctil */
ion-button {
  --min-height: 44px;
  --min-width: 44px;
  --padding-start: 1rem;
  --padding-end: 1rem;
}

/* Agregar padding alrededor de elementos pequeños */
.icon-button {
  padding: 12px;  /* 44px total (20px icono + 24px padding) */
  min-width: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Remover highlight color en iOS */
ion-button {
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  -webkit-user-select: none;
}
```

### 1.5 Slider / Swipe Gestos No Funcionan

**Problema:** En iOS, sliders o swipes detectados incorrectamente.

**Solución:**

```typescript
// custom-slider.component.ts
import { Gesture, GestureController } from '@ionic/angular';

@Component({
  selector: 'app-custom-slider',
  template: `
    <div class="slider" #sliderEl>
      <ion-slides>
        <ion-slide *ngFor="let item of items">
          {{ item }}
        </ion-slide>
      </ion-slides>
    </div>
  `
})
export class CustomSliderComponent implements OnInit {
  @ViewChild('sliderEl') sliderEl!: ElementRef;

  constructor(private gestureCtrl: GestureController) {}

  ngOnInit() {
    this.createGesture();
  }

  private createGesture() {
    const gesture = this.gestureCtrl.create({
      el: this.sliderEl.nativeElement,
      gestureName: 'my-swipe',
      onStart: () => console.log('Swipe start'),
      onMove: (detail) => this.handleSwipe(detail),
      onEnd: () => console.log('Swipe end'),
      threshold: 10  // Mínimo movimiento antes de detectar
    });

    gesture.enable(true);
  }

  private handleSwipe(detail: any) {
    // detail.velocityX, detail.velocityY
  }
}
```

### 1.6 Images No Cargan en iPad Landscape

**Problema:** Imágenes desaparecen al rotar a landscape.

**Solución:**

```html
<!-- Usar srcset para diferentes densidades -->
<img 
  src="image-small.jpg" 
  srcset="
    image-small.jpg 375w,
    image-medium.jpg 768w,
    image-large.jpg 1024w,
    image-xl.jpg 1366w
  "
  sizes="
    (max-width: 390px) 100vw,
    (max-width: 768px) 100vw,
    (max-width: 1024px) 90vw,
    1024px
  "
  alt="Descripción"
  loading="lazy"
  decoding="async">
```

```typescript
// image.service.ts — Usar Cloudinary para responsive images
export class ImageService {
  getResponsiveImageUrl(publicId: string, width: number): string {
    return `https://res.cloudinary.com/YOUR_CLOUD/image/upload/w_${width},c_fill,q_auto,f_auto/${publicId}`;
  }

  getImageUrls(publicId: string) {
    return {
      mobile: this.getResponsiveImageUrl(publicId, 375),
      tablet: this.getResponsiveImageUrl(publicId, 768),
      desktop: this.getResponsiveImageUrl(publicId, 1024)
    };
  }
}
```

---

## 2. Reglas Específicas para iPad

### 2.1 Split View / Multitasking

**En iPad, la app puede aparecer en 50/50 split view o flotante. Adaptar layout:**

```css
/* iPad en split view ≈ 450-500px ancho */
@media (max-width: 600px) and (min-width: 768px) {
  /* Stack vertical aunque sea tablet */
  .master-detail-container {
    display: flex;
    flex-direction: column;
  }
  
  .master {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--color-surface-variant);
  }
  
  .detail {
    width: 100%;
  }
}

/* iPad normal / landscape — mostrar side-by-side */
@media (min-width: 768px) and (min-aspect-ratio: 16/10) {
  .master-detail-container {
    display: grid;
    grid-template-columns: 300px 1fr;
    gap: 1rem;
  }

  .master {
    border-right: 1px solid var(--color-surface-variant);
    max-height: 100vh;
    overflow-y: auto;
  }

  .detail {
    padding: 1.5rem;
  }
}

/* iPad Pro 12.9" — máximo aprovechamiento */
@media (min-width: 1366px) {
  .master-detail-container {
    grid-template-columns: 350px 1fr;
  }

  .sidebar {
    width: 280px;
  }
}
```

### 2.2 Keyboard en iPad (No Siempre Oculta)

```typescript
// En iPad, el teclado suele permanecer visible
// Ajustar layout dinámicamente

export class FormComponent implements OnInit {
  @ViewChild(IonContent) content!: IonContent;

  keyboardHeight = 0;

  constructor(private keyboard: Keyboard) {}

  ngOnInit() {
    this.monitorKeyboard();
  }

  private monitorKeyboard() {
    this.keyboard.addListener('keyboardDidShow', (info) => {
      this.keyboardHeight = info.keyboardHeight;
      // Hacer scroll solo si necesario
      if (this.isInputBlocked()) {
        this.content.scrollToBottom(300);
      }
    });

    this.keyboard.addListener('keyboardDidHide', () => {
      this.keyboardHeight = 0;
    });
  }

  private isInputBlocked(): boolean {
    // Verificar si el input activo está cubierto por el teclado
    const activeElement = document.activeElement as HTMLInputElement;
    if (!activeElement) return false;

    const rect = activeElement.getBoundingClientRect();
    const keyboardTop = window.innerHeight - this.keyboardHeight;

    return rect.bottom > keyboardTop;
  }
}
```

### 2.3 Landscape Orientation en iPad

```typescript
// monitor-orientation.component.ts
import { Screen } from '@capacitor/screen';
import { OrientationPlugin } from '@capacitor/screen';

export class MonitorOrientationComponent implements OnInit {
  orientation: 'portrait' | 'landscape' = 'portrait';

  ngOnInit() {
    Screen.addListener('screenOrientationChange', (event) => {
      this.orientation = event.orientation === 0 ? 'portrait' : 'landscape';
      this.adjustLayout();
    });
  }

  adjustLayout() {
    const ipad = window.innerWidth > 768;
    const isLandscape = window.innerWidth > window.innerHeight;

    if (ipad && isLandscape) {
      // Layout para iPad landscape
      // Ejemplo: Mostrar sidebar + contenido + detalles en 3 columnas
    }
  }
}
```

```css
@media (min-width: 768px) and (orientation: landscape) {
  /* iPad landscape específicamente */
  .container {
    display: grid;
    grid-template-columns: 1fr 2fr 1.5fr;
    gap: 1.5rem;
  }
}

@media (min-width: 768px) and (orientation: portrait) {
  /* iPad portrait */
  .container {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 1.5rem;
  }
}
```

---

## 3. Reglas CSS Específicas iOS

### 3.1 Webkit Prefixes (aún necesarios en iOS)

```css
/* Momentum scrolling */
.scrollable {
  -webkit-overflow-scrolling: touch;
}

/* User select */
.no-select {
  -webkit-user-select: none;
  user-select: none;
}

/* Tap highlight */
* {
  -webkit-tap-highlight-color: transparent;
}

/* Font smoothing */
body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Flex en iOS older */
.flex-container {
  display: -webkit-flex;  /* iOS < 9 */
  display: flex;
}

/* Position fixed en iOS (con cuidado) */
.fixed-header {
  position: -webkit-sticky;  /* iOS 12 y más viejos */
  position: sticky;
  top: 0;
}
```

### 3.2 Inputs y Forms

```css
/* iOS agrega zoom cuando input < 16px */
input {
  font-size: 16px;  /* Prevenir auto-zoom */
}

/* Safari agrega buttons redondeados por defecto */
input[type="button"],
input[type="submit"],
input[type="reset"],
button {
  -webkit-appearance: none;
  appearance: none;
}

/* Range slider en iOS */
input[type="range"] {
  -webkit-appearance: slider-horizontal;
  width: 100%;
}

/* Search input en iOS */
input[type="search"] {
  -webkit-appearance: textfield;
}

input[type="search"]::-webkit-search-cancel-button {
  -webkit-appearance: searchfield-cancel-button;
}
```

### 3.3 Video y Media

```css
/* Video responsivo */
video {
  width: 100%;
  height: auto;
  object-fit: cover;
}

/* Prevenir que iOS abra full-screen videos */
video {
  playsinline: true;  /* HTML attribute */
  webkit-playsinline: true;  /* Fallback */
}
```

```html
<!-- HTML correcto para video responsivo -->
<video 
  width="100%" 
  height="auto"
  playsinline
  webkit-playsinline
  controls>
  <source src="video.mp4" type="video/mp4">
  Tu navegador no soporta HTML5 video.
</video>
```

---

## 4. Haptic Feedback (Vibraciones)

```typescript
// haptic.service.ts
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export class HapticService {
  async tapMedium() {
    await Haptics.impact({ style: ImpactStyle.Medium });
  }

  async tapLight() {
    await Haptics.impact({ style: ImpactStyle.Light });
  }

  async tapHeavy() {
    await Haptics.impact({ style: ImpactStyle.Heavy });
  }

  async selectionStart() {
    await Haptics.selectionStart();
  }

  async selectionChanged() {
    await Haptics.selectionChanged();
  }

  async selectionEnd() {
    await Haptics.selectionEnd();
  }
}
```

```typescript
// Usar en componentes
export class TareaCardComponent {
  constructor(private haptics: HapticService) {}

  onTap() {
    this.haptics.tapLight();
  }

  onSubmit() {
    this.haptics.tapMedium();
  }

  onDelete() {
    this.haptics.tapHeavy();  // Acción destructiva = vibración fuerte
  }
}
```

---

## 5. Status Bar y Safe Area Avanzado

```typescript
// app.component.ts
import { StatusBar, Style } from '@capacitor/status-bar';

export class AppComponent implements OnInit {
  async ngOnInit() {
    // Configurar status bar según el tema
    if (this.isDarkMode()) {
      await StatusBar.setStyle({ style: Style.Dark });
    } else {
      await StatusBar.setStyle({ style: Style.Light });
    }

    // Color de fondo del status bar
    await StatusBar.setBackgroundColor({ color: '#1A2F5A' });

    // Mostrar/ocultar status bar
    await StatusBar.show();
  }

  isDarkMode(): boolean {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
}
```

```css
/* Safe area variables */
.container {
  margin-top: env(safe-area-inset-top);
  margin-bottom: env(safe-area-inset-bottom);
  margin-left: env(safe-area-inset-left);
  margin-right: env(safe-area-inset-right);
}

/* Safe area en grid */
@supports (padding: max(0px)) {
  ion-content {
    padding-left: max(env(safe-area-inset-left), 1rem);
    padding-right: max(env(safe-area-inset-right), 1rem);
    padding-top: max(env(safe-area-inset-top), 0);
    padding-bottom: max(env(safe-area-inset-bottom), 1rem);
  }
}
```

---

## 6. Performance Tunning para iOS/iPad

### 6.1 Lazy Loading Imágenes

```typescript
// image-lazy-load.directive.ts
import { Directive, ElementRef, OnInit } from '@angular/core';

@Directive({
  selector: 'img[appLazyLoad]'
})
export class LazyLoadDirective implements OnInit {
  constructor(private el: ElementRef) {}

  ngOnInit() {
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement;
            img.src = img.dataset['src'] || '';
            img.classList.add('loaded');
            observer.unobserve(img);
          }
        });
      }, { rootMargin: '50px' });

      observer.observe(this.el.nativeElement);
    }
  }
}
```

```html
<img 
  appLazyLoad
  data-src="image.jpg"
  src="placeholder.jpg"
  loading="lazy">
```

### 6.2 Code Splitting en Ionic

```typescript
// app-routing.module.ts
const routes: Routes = [
  {
    path: 'tareas',
    loadChildren: () => import('./pages/tareas/tareas.module')
      .then(m => m.TareasModule)
  },
  {
    path: 'actividades',
    loadChildren: () => import('./pages/actividades/actividades.module')
      .then(m => m.ActividadesModule)
  }
  // Lazy load de cada sección
];
```

### 6.3 Memory Leaks — Unsubscribe

```typescript
// component base para manejo de subscripciones
import { Component, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-base',
  template: ''
})
export class BaseComponent implements OnDestroy {
  protected destroy$ = new Subject<void>();

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

// Usar en componentes
export class TareasComponent extends BaseComponent {
  tareas$ = this.tareasService.getTareas().pipe(
    takeUntil(this.destroy$)  // Auto-cleanup al destruir
  );
}
```

---

## 7. Testing en iOS/iPad

### 7.1 Test Breakpoints Responsivos

```typescript
// app.component.spec.ts
describe('AppComponent Responsive', () => {
  let component: AppComponent;
  let fixture: ComponentFixture<AppComponent>;

  beforeEach(() => {
    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
  });

  it('should render correctly on iPhone SE (375px)', () => {
    setViewport(375, 667);
    fixture.detectChanges();
    
    const header = fixture.nativeElement.querySelector('ion-header');
    expect(header.offsetWidth).toBeLessThanOrEqual(375);
  });

  it('should render correctly on iPad (768px)', () => {
    setViewport(768, 1024);
    fixture.detectChanges();
    
    const grid = fixture.nativeElement.querySelector('ion-grid');
    expect(grid.children.length).toBeGreaterThan(1);  // Multi-column
  });

  function setViewport(width: number, height: number) {
    (window as any).innerWidth = width;
    (window as any).innerHeight = height;
    window.dispatchEvent(new Event('resize'));
  }
});
```

### 7.2 Test Touch Events

```typescript
it('should respond to touch events on button', () => {
  const button = fixture.nativeElement.querySelector('ion-button');
  spyOn(component, 'onClick');
  
  button.dispatchEvent(new TouchEvent('touchstart', {
    touches: [{ clientX: 0, clientY: 0 }] as any
  }));
  
  expect(component.onClick).toHaveBeenCalled();
});
```

---

## 8. Debugging en Xcode

```bash
# Conectar iPad/iPhone a Mac
# En Xcode: Preferences → Accounts → Add Apple ID

# Abrir Safari Web Inspector
# Safari → Develop → [Tu Device] → [Tu App]

# Log desde app
console.log('Debug:', myVariable);  // Aparece en Safari Console

# Ver red/requests
# Safari Inspector → Network tab
```

---

## 9. Deployment Checklist para App Store

- [ ] **Build Settings**: Generic iOS Device
- [ ] **Bundle ID**: Único, registrado en Apple Developer
- [ ] **Version**: Incrementar con cada release
- [ ] **Icons**: Todos los tamaños (1024x1024 requerido)
- [ ] **Splash Screens**: Portrait + Landscape para iPad
- [ ] **Launch Screen**: Usar LaunchScreen.storyboard (no imágenes estáticas)
- [ ] **Privacy Policy**: URL válida en App Store listing
- [ ] **Screenshots**: iPad (12.9" Pro), iPad (8.3" Air), iPhone 6.7" Pro Max
- [ ] **Safe Area**: Testear en notched devices (iPhone X+)
- [ ] **Orientations**: Activar soportadas en Info.plist
- [ ] **iOS Deployment Target**: Mínimo 13.0
- [ ] **Permissions**: Explicar cada una (Cámara, Foto, Ubicación)
- [ ] **Code Signing**: Certificados y provisioning profiles activos
- [ ] **Build**: Pasar archivo .ipa a TestFlight antes de enviar a App Store

---

## 10. Recursos iOS/iPad

- **Apple HIG**: https://developer.apple.com/design/human-interface-guidelines/ios
- **iPad HIG**: https://developer.apple.com/design/human-interface-guidelines/ipad
- **Capacitor iOS Docs**: https://capacitorjs.com/docs/getting-started/with-ionic
- **Xcode Documentation**: https://developer.apple.com/xcode/
- **Safe Area Guide**: https://webkit.org/blog/7929/designing-websites-for-iphone-x/
- **WebKit Blog**: https://webkit.org/blog/
- **Ionic iOS Guide**: https://ionicframework.com/docs/building/ios

---

**Versión:** 1.1 — 28 de agosto de 2026  
**Actualizado para:** Ionic 6+, iOS 13-17, iPad Air/Pro
