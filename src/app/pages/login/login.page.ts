import { Component, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { SesionService } from '../../services/sesion.service';

// ── Constantes de seguridad ──────────────────────────────────────────────────
const MAX_INTENTOS     = 5;
const BLOQUEO_MS       = 30_000;   // 30 s de bloqueo
const DELAY_BASE_MS    = 800;      // demora mínima anti-timing
const MAX_LEN_USERNAME = 80;
const MAX_LEN_PASSWORD = 128;
const MAX_LEN_CODIGO   = 10;
// Antes este regex era /^[A-Z0-9]{6,10}$/ y no permitía el guion que
// realmente traen los códigos guardados en users_tutor.codigo_acceso
// (ej. "TUT-N1A01"), así que el login de tutor rechazaba el código
// antes de siquiera consultar la base de datos. Se agrega el guion.
const CODIGO_REGEX     = /^[A-Z0-9-]{6,10}$/;
const USERNAME_REGEX   = /^[a-zA-Z0-9._@\-]{1,80}$/;

// Registro en memoria de intentos fallidos por modo
const _intentos: Record<string, { count: number; bloqueadoHasta: number }> = {};

function clave(modo: string): string { return `login_${modo}`; }

function sanitize(val: string): string {
  return val.replace(/[<>'"&\\]/g, '').trim().slice(0, 256);
}

function waitAtLeast(start: number, ms: number): Promise<void> {
  const elapsed = Date.now() - start;
  return new Promise(r => setTimeout(r, Math.max(0, ms - elapsed)));
}

// ─────────────────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: false,
})
export class LoginPage implements OnDestroy {

  modo: 'escolar' | 'tutor' = 'escolar';

  username    = '';
  password    = '';
  codigoTutor = '';

  error           = '';
  cargando        = false;
  mostrarPassword = false;

  bloqueado         = false;
  segundosRestantes = 0;
  private _timerRef: any = null;

  constructor(private sesion: SesionService, private router: Router) {}

  ngOnDestroy() { this._clearTimer(); }

  // ── Modo ─────────────────────────────────
  setModo(m: 'escolar' | 'tutor') {
    this.modo        = m;
    this.error       = '';
    this.username    = '';
    this.password    = '';
    this.codigoTutor = '';
    this._actualizarEstadoBloqueo();
  }

  // ── Getters UI ───────────────────────────
  get intentosRestantes(): number {
    const r = _intentos[clave(this.modo)];
    return r ? Math.max(0, MAX_INTENTOS - r.count) : MAX_INTENTOS;
  }

  get mostrarAdvertenciaIntentos(): boolean {
    return !this.bloqueado && this.intentosRestantes <= 2 && this.intentosRestantes > 0;
  }

  // ── Login escolar ────────────────────────
  async login() {
    if (this._estaBloqueado()) return;

    if (!this.username.trim() || !this.password.trim()) {
      this.error = 'Por favor ingresa usuario y contraseña.';
      return;
    }

    const user = sanitize(this.username);
    const pass = this.password.trim().slice(0, MAX_LEN_PASSWORD);

    if (!USERNAME_REGEX.test(user)) {
      this.error = 'El usuario contiene caracteres no permitidos.';
      return;
    }

    if (user.length > MAX_LEN_USERNAME || pass.length > MAX_LEN_PASSWORD) {
      this.error = 'Datos de acceso inválidos.';
      return;
    }

    await this._ejecutarLogin('escolar', () => this.sesion.iniciarSesion(user, pass));
  }

  // ── Login tutor ──────────────────────────
  async loginTutor() {
    if (this._estaBloqueado()) return;

    const codigo = this.codigoTutor.trim().toUpperCase().slice(0, MAX_LEN_CODIGO);

    if (!codigo) {
      this.error = 'Por favor ingresa tu código de acceso.';
      return;
    }

    if (!CODIGO_REGEX.test(codigo)) {
      this.error = 'El código debe tener entre 6 y 10 caracteres alfanuméricos.';
      return;
    }

    await this._ejecutarLogin('tutor', () => this.sesion.iniciarSesionTutor(codigo));
  }

  // ── Núcleo de login con rate limiting ────
  private async _ejecutarLogin(modoClave: string, fn: () => Promise<boolean>) {
    const key   = clave(modoClave);
    const start = Date.now();

    if (!_intentos[key]) _intentos[key] = { count: 0, bloqueadoHasta: 0 };

    this.cargando = true;
    this.error    = '';

    let ok = false;
    try { ok = await fn(); } catch { ok = false; }

    await waitAtLeast(start, DELAY_BASE_MS);
    this.cargando = false;

    if (ok) {
      delete _intentos[key];
      this.router.navigate(['/inicio'], { replaceUrl: true });
      return;
    }

    _intentos[key].count++;

    if (_intentos[key].count >= MAX_INTENTOS) {
      _intentos[key].bloqueadoHasta = Date.now() + BLOQUEO_MS;
      this._iniciarCuentaRegresiva(key);
      this.error = `Demasiados intentos fallidos. Intenta en ${BLOQUEO_MS / 1000} segundos.`;
    } else {
      const restantes = MAX_INTENTOS - _intentos[key].count;
      this.error = restantes === 1
        ? 'Credenciales incorrectas. Te queda 1 intento antes del bloqueo.'
        : `Credenciales incorrectas. Intentos restantes: ${restantes}.`;
    }
  }

  // ── Bloqueo ──────────────────────────────
  private _estaBloqueado(): boolean {
    const r = _intentos[clave(this.modo)];
    if (r && r.bloqueadoHasta > Date.now()) {
      const seg = Math.ceil((r.bloqueadoHasta - Date.now()) / 1000);
      this.error    = `Acceso bloqueado. Intenta en ${seg} segundos.`;
      this.bloqueado = true;
      return true;
    }
    if (this.bloqueado) this._actualizarEstadoBloqueo();
    return false;
  }

  private _actualizarEstadoBloqueo() {
    const r = _intentos[clave(this.modo)];
    this.bloqueado = !!(r && r.bloqueadoHasta > Date.now());
    if (!this.bloqueado) { this._clearTimer(); this.segundosRestantes = 0; }
  }

  private _iniciarCuentaRegresiva(key: string) {
    this.bloqueado = true;
    this._clearTimer();
    this._timerRef = setInterval(() => {
      const r = _intentos[key];
      if (!r || r.bloqueadoHasta <= Date.now()) {
        this.bloqueado = false; this.segundosRestantes = 0; this.error = '';
        if (r) delete _intentos[key];
        this._clearTimer();
        return;
      }
      this.segundosRestantes = Math.ceil((r.bloqueadoHasta - Date.now()) / 1000);
      this.error = `Acceso bloqueado. Intenta en ${this.segundosRestantes} segundos.`;
    }, 1000);
  }

  private _clearTimer() {
    if (this._timerRef !== null) { clearInterval(this._timerRef); this._timerRef = null; }
  }

  togglePassword() { this.mostrarPassword = !this.mostrarPassword; }
}
