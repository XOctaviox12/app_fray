import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from 'src/environments/environment';

export interface Usuario {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  rol: string;
  foto_perfil: string | null;
  plantel_id?: number;
  telefono?: string | null;
  direccion?: string | null;
  fecha_nacimiento?: string | null;
  date_joined?: string;
  estatus?: string;
  is_active?: boolean;
  alumno_grupo_id?: number;
  token?: string;   // ← nuevo: token de sesión emitido por Supabase (RPC crear_sesion)
  [key: string]: any;
}

export interface SesionTutor {
  _tipo:      'TUTOR';
  id:         number;
  nombre:     string;
  parentesco: string;
  correo:     string | null;
  telefono:   string;
  alumno_id:  number;
  rol:        'TUTOR';
  token?:     string;   // ← nuevo
}

const STORAGE_KEY = 'usuario_sesion';

@Injectable({ providedIn: 'root' })
export class SesionService {
  readonly supabase: SupabaseClient;

  usuario:  Usuario    | null = null;
  tutor:    SesionTutor | null = null;
  loggedIn  = false;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    this.cargarSesionLocal();
  }

cargarSesionLocal(): void {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (parsed._tipo === 'TUTOR') {
      this.tutor = parsed;
      this.loggedIn = true;
    } else {
      // Si la sesión guardada no tiene 'estatus', es una sesión vieja
      // de antes de que agregáramos ese campo al select. Forzamos
      // nuevo login para traer los datos completos.
      if (parsed.estatus === undefined) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      this.usuario = parsed;
      this.loggedIn = true;
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

// ── Login alumno / maestro ───────────────────────────────
async iniciarSesion(username: string, password: string): Promise<boolean> {
  try {
    const { data, error } = await this.supabase
      .rpc('verificar_login', { p_username: username, p_password: password })
      .single<Usuario>();

    if (error || !data) { console.error('Login fallido:', error?.message); return false; }

    const seguro = { ...data } as any;

    // Emitir token de sesión vía RPC (para poder usar RLS en tablas sensibles
    // sin depender de supabase.auth, que este proyecto no usa)
    const { data: token, error: eToken } = await this.supabase.rpc('crear_sesion', { p_user_id: seguro.id });
    if (eToken) { console.error('No se pudo crear la sesion:', eToken.message); return false; }

    seguro.token = token;
    this.usuario = seguro; this.tutor = null; this.loggedIn = true;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seguro));
    return true;
  } catch (e: any) { console.error(e.message); return false; }
}

  // ── Login tutor por código de acceso ─────────────────────
  // users_tutor.codigo_acceso es un campo generado por Django en Tutor.save()
// ── Login tutor por código de acceso ─────────────────────
  // users_tutor.codigo_acceso es un campo generado por Django en Tutor.save()
  async iniciarSesionTutor(codigo: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('users_tutor')
        .select('id, nombre, parentesco, correo, telefono, alumno_id, codigo_acceso')
        .eq('codigo_acceso', codigo).single();

      if (error || !data) { console.error('Login tutor fallido:', error?.message); return false; }

      // Tutor no tiene fila en users_user, así que se le pasa un flag propio a crear_sesion
      const { data: token, error: eToken } = await this.supabase.rpc('crear_sesion_tutor', { p_tutor_id: data.id });
      if (eToken) { console.error('No se pudo crear la sesion del tutor:', eToken.message); return false; }

      const sesion: SesionTutor = {
        _tipo: 'TUTOR', id: data.id, nombre: data.nombre, parentesco: data.parentesco,
        correo: data.correo, telefono: data.telefono, alumno_id: data.alumno_id, rol: 'TUTOR',
        token,
      };
      this.tutor = sesion; this.usuario = null; this.loggedIn = true;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sesion));
      return true;
    } catch (e: any) { console.error(e.message); return false; }
  }

// ── Cerrar sesión ────────────────────────────────────────
  async cerrarSesion(): Promise<void> {
    const token = this.usuario?.token || this.tutor?.token;
    if (token) {
      try {
        await this.supabase.rpc('cerrar_sesion', { p_token: token });
      } catch {
        // no crítico: si falla, el token simplemente expira solo por su expira_en
      }
    }
    this.usuario = null; this.tutor = null; this.loggedIn = false;
    localStorage.removeItem(STORAGE_KEY);
  }

  // ── Rol ──────────────────────────────────────────────────
  get rolActual(): string {
    if (this.tutor) return 'TUTOR';
    return (this.usuario?.rol || '').toUpperCase();
  }

  esDocente(): boolean { return ['DOCENTE','COORD','DIRECTOR'].includes(this.rolActual); }
  esAlumno():  boolean { return this.rolActual === 'ALUMNO'; }
  esTutor():   boolean { return this.rolActual === 'TUTOR'; }

  // ── Display ──────────────────────────────────────────────
  getNombreDisplay(): string {
    if (this.tutor) return this.tutor.nombre;
    if (!this.usuario) return '';
    return `${this.usuario.first_name} ${this.usuario.last_name}`.trim() || this.usuario.username;
  }

  getAvatarUrl(): string {
    if (this.tutor || !this.usuario?.foto_perfil) return 'assets/img/default-avatar.png';
    if (this.usuario.foto_perfil.startsWith('http')) return this.usuario.foto_perfil;
    const { data } = this.supabase.storage.from('avatars').getPublicUrl(this.usuario.foto_perfil);
    return data.publicUrl;
  }
}
