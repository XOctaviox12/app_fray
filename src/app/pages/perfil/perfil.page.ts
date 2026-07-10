import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, AlertController, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { SesionService, Usuario } from '../../services/sesion.service';
import { CloudinaryService } from '../../services/cloudinary.service';

interface FormEdicionPerfil {
  telefono: string;
  direccion: string;
  fecha_nacimiento: string | null;
}

@Component({
  selector: 'app-perfil',
  templateUrl: './perfil.page.html',
  styleUrls: ['./perfil.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class PerfilPage implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  usuario: Usuario | null = null;
  avatarUrl = 'assets/img/default-avatar.png';

  editando = false;
  guardando = false;
  subiendoFoto = false;
  progresoFoto = 0;
  cerrandoSesion = false;
  errorGuardado = '';

  formEdicion: FormEdicionPerfil = {
    telefono: '',
    direccion: '',
    fecha_nacimiento: null,
  };

  hoyISO = new Date().toISOString();

  private readonly nombresRoles: Record<string, string> = {
    ADMIN: 'Administrador',
    DIRECTOR: 'Director',
    COORD: 'Coordinador',
    DOCENTE: 'Docente',
    ALUMNO: 'Estudiante',
    TUTOR: 'Tutor',
  };

  constructor(
    private sesion: SesionService,
    private router: Router,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private cloudinary: CloudinaryService,
  ) {}


  ngOnInit() {
    this.cargarUsuario();
  }

  ionViewWillEnter() {
    this.cargarUsuario();
  }

  private cargarUsuario() {
    this.usuario = this.sesion.usuario;
    this.avatarUrl = this.sesion.getAvatarUrl();
  }

  // ── Edición ──────────────────────────────────
  toggleEdicion() {
    if (this.editando) {
      this.editando = false;
      this.errorGuardado = '';
      return;
    }
    this.formEdicion = {
      telefono: this.usuario?.telefono || '',
      direccion: this.usuario?.direccion || '',
      fecha_nacimiento: this.usuario?.fecha_nacimiento || null,
    };
    this.editando = true;
  }

  async guardarCambios() {
    if (!this.usuario) return;
    this.guardando = true;
    this.errorGuardado = '';

    // Validación simple de teléfono si viene algo
    const tel = this.formEdicion.telefono?.trim();
    if (tel && !/^\d{7,15}$/.test(tel.replace(/[\s-]/g, ''))) {
      this.errorGuardado = 'El teléfono no parece válido.';
      this.guardando = false;
      return;
    }

    try {
      const { error } = await this.sesion.supabase
        .from('users_user')
        .update({
          telefono: tel || null,
          direccion: this.formEdicion.direccion?.trim() || null,
          fecha_nacimiento: this.formEdicion.fecha_nacimiento
            ? this.formEdicion.fecha_nacimiento.substring(0, 10)
            : null,
        })
        .eq('id', this.usuario.id);

      if (error) throw error;

      // Reflejar cambios localmente sin recargar toda la sesión
      this.usuario = {
        ...this.usuario,
        telefono: tel || undefined,
        direccion: this.formEdicion.direccion?.trim() || undefined,
        fecha_nacimiento: this.formEdicion.fecha_nacimiento || undefined,
      };
      this.sesion.usuario = this.usuario;

      this.editando = false;
      const toast = await this.toastCtrl.create({
        message: 'Perfil actualizado',
        duration: 1800,
        color: 'success',
      });
      await toast.present();
    } catch (e: any) {
      this.errorGuardado = 'No se pudo guardar: ' + (e.message || 'error desconocido');
    } finally {
      this.guardando = false;
    }
  }

  // ── Foto de perfil ──────────────────────────
  seleccionarFoto() {
    this.fileInput?.nativeElement.click();
  }

  async onFotoSeleccionada(event: Event) {
  const input = event.target as HTMLInputElement;
  const archivo = input.files?.[0];
  if (!archivo || !this.usuario) return;

  if (!archivo.type.startsWith('image/')) {
    this.errorGuardado = 'Selecciona un archivo de imagen válido.';
    return;
  }
  if (archivo.size > 5 * 1024 * 1024) {
    this.errorGuardado = 'La imagen no debe superar 5MB.';
    return;
  }

  this.subiendoFoto = true;
  this.progresoFoto = 0;
  this.errorGuardado = '';
  try {
    const subido = await this.cloudinary.subirArchivo(archivo, pct => this.progresoFoto = pct);

    const { error } = await this.sesion.supabase
      .from('users_user')
      .update({ foto_perfil: subido.url })
      .eq('id', this.usuario.id);

    if (error) throw error;

    this.usuario = { ...this.usuario, foto_perfil: subido.url };
    this.sesion.usuario = this.usuario;
    this.avatarUrl = subido.url;

    // Mantener localStorage sincronizado, como hace SesionService al iniciar sesión
    localStorage.setItem('usuario_sesion', JSON.stringify(this.usuario));
  } catch (e: any) {
    this.errorGuardado = 'No se pudo actualizar la foto: ' + (e.message || 'error desconocido');
  } finally {
    this.subiendoFoto = false;
    input.value = '';
  }
}

  onErrorImagen() {
    this.avatarUrl = 'assets/img/default-avatar.png';
  }

  // ── Getters de display ──────────────────────
  getNombreCompleto(): string {
    if (!this.usuario) return '';
    const nombre = `${this.usuario.first_name || ''} ${this.usuario.last_name || ''}`.trim();
    return nombre || this.usuario.username;
  }

  getRolDisplay(): string {
    const rol = (this.usuario?.rol || '').toUpperCase();
    return this.nombresRoles[rol] || this.usuario?.rol || 'Sin rol asignado';
  }

esActivo(): boolean {
  const est = this.usuario?.estatus?.toString().trim().toLowerCase();

  if (est) {
    // Cubre variantes comunes que a veces se usan en la BD
    const valoresActivos = ['activo', 'active', 'activa', '1', 'true'];
    return valoresActivos.includes(est);
  }

  // Fallback si no hay estatus, usa is_active
  return !!this.usuario?.is_active;
}

  getFechaMiembro(): string {
    if (!this.usuario?.date_joined) return '';
    return new Date(this.usuario.date_joined).toLocaleDateString('es-ES', {
      year: 'numeric', month: 'long',
    });
  }

  getFechaNacimiento(): string {
    if (!this.usuario?.fecha_nacimiento) return 'No registrada';
    return new Date(this.usuario.fecha_nacimiento).toLocaleDateString('es-ES', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  }

  // ── Logout ───────────────────────────────────
  async confirmarCerrarSesion() {
    const alert = await this.alertCtrl.create({
      header: '¿Cerrar sesión?',
      message: 'Tendrás que volver a iniciar sesión para acceder.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Cerrar sesión', role: 'destructive', handler: () => this.cerrarSesion() },
      ],
    });
    await alert.present();
  }

  async cerrarSesion() {
    if (this.cerrandoSesion) return;
    this.cerrandoSesion = true;
    try {
      await this.sesion.cerrarSesion();
      this.router.navigate(['/login'], { replaceUrl: true });
    } catch (e) {
      console.error('Error al cerrar sesión:', e);
      this.cerrandoSesion = false;
    }
  }
}
