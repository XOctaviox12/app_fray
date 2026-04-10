import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../environments/environment';

interface Usuario {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  rol: string;
  foto_perfil: string | null;
  status: boolean;
  estatus: string;
}

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit {
  private supabase: SupabaseClient;
  usuario: Usuario | null = null;
  loggedIn = false;
  avatarUrl = 'assets/img/default-avatar.png';

  constructor(private router: Router) {
    // Sin auth, sin locks — cliente simple
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      }
    });
  }

  async ngOnInit() {
    this.cargarSesionLocal();
  }

  // Lee el usuario guardado en localStorage al iniciar la app
  cargarSesionLocal() {
    const raw = localStorage.getItem('usuario_sesion');
    if (raw) {
      try {
        this.usuario = JSON.parse(raw);
        this.loggedIn = true;
        this.actualizarAvatar();
      } catch {
        localStorage.removeItem('usuario_sesion');
      }
    }
  }

  // Llama este método desde tu página de login después de validar credenciales
  async iniciarSesion(username: string, password: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('users_user')
      .select('id, username, first_name, last_name, email, rol, foto_perfil, status, estatus, password_plana')
      .eq('username', username)
      .eq('password_plana', password)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      console.error('Login fallido:', error?.message);
      return false;
    }

    // Guardar en memoria y localStorage
    const { password_plana, ...usuarioSeguro } = data;
    this.usuario = usuarioSeguro;
    this.loggedIn = true;
    this.actualizarAvatar();
    localStorage.setItem('usuario_sesion', JSON.stringify(usuarioSeguro));
    return true;
  }

  actualizarAvatar() {
    if (this.usuario?.foto_perfil) {
      if (this.usuario.foto_perfil.startsWith('http')) {
        this.avatarUrl = this.usuario.foto_perfil;
      } else {
        const { data } = this.supabase.storage
          .from('avatars')
          .getPublicUrl(this.usuario.foto_perfil);
        this.avatarUrl = data.publicUrl;
      }
    } else {
      this.avatarUrl = 'assets/img/default-avatar.png';
    }
  }

  getNombreDisplay(): string {
    if (!this.usuario) return '';
    const nombre = `${this.usuario.first_name} ${this.usuario.last_name}`.trim();
    return nombre || this.usuario.username;
  }

  getEmailDisplay(): string {
    return this.usuario?.email || '';
  }

  onErrorImagen() {
    this.avatarUrl = 'assets/img/default-avatar.png';
  }

  cerrarSesion() {
    this.usuario = null;
    this.loggedIn = false;
    this.avatarUrl = 'assets/img/default-avatar.png';
    localStorage.removeItem('usuario_sesion');
    this.router.navigate(['/login']);
  }
}
