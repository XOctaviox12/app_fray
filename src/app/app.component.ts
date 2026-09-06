import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, MenuController, Platform } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { SesionService, Usuario } from './services/sesion.service';
import { NetworkStatusService } from '../environments/network-status.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit, OnDestroy {

  // Año dinámico para el footer del menú
  currentYear = new Date().getFullYear();

  // Fallback de avatar
  private avatarFallback = 'assets/img/default-avatar.png';
  private avatarErrorOcurrido = false;
  private ultimaAvatarUrlCruda: string | null = null;
  private avatarCacheBuster = 0;

  // Badges
  hayAsistenciaPendienteHoy = false;
  hayClaseEnVivoActiva = false;

  // Estado de conexión
  sinConexion = false;
  private networkSub?: Subscription;

  // Keep-alive para iOS (mantiene el WebView activo)
  private keepAliveInterval: any;

  constructor(
    private router: Router,
    private sesion: SesionService,
    private alertCtrl: AlertController,
    private menuCtrl: MenuController,
    private networkStatus: NetworkStatusService,
    private platform: Platform,
  ) {}

  ngOnInit() {
    if (this.esDocente) this.chequearAsistenciaPendienteHoy();

    this.networkSub = this.networkStatus.online$.subscribe(isOnline => {
      this.sinConexion = !isOnline;
    });

    // Iniciar keep-alive solo en iOS
    this.platform.ready().then(() => {
      if (this.platform.is('ios')) {
        this.startKeepAlive();
      }
    });
  }

  ngOnDestroy() {
    this.networkSub?.unsubscribe();
    this.stopKeepAlive();
  }

  // ── Keep-alive: mantiene el WebView activo ────────────────────────────────
  private startKeepAlive() {
    this.stopKeepAlive();
    this.keepAliveInterval = setInterval(() => {
      // Operación trivial que fuerza un reflow
      document.body.getBoundingClientRect();
    }, 500);
  }

  private stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  // ── HostListener: fuerza el foco en inputs al tocarlos (iOS) ──────────────
  @HostListener('document:touchstart', ['$event'])
  onTouchStart(event: TouchEvent) {
    if (this.platform.is('ios')) {
      const target = event.target as HTMLElement;
      // Si el toque fue en un input o textarea, forzar foco
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        setTimeout(() => {
          target.focus();
        }, 10);
      }
    }
  }

  // ── Getters ─────────────────────────────────────────────────────────────────
  get usuario(): Usuario | null {
    return this.sesion.usuario;
  }

  get loggedIn(): boolean {
    return this.sesion.loggedIn;
  }

  get avatarUrl(): string {
    const urlCruda = this.sesion.getAvatarUrl();

    if (urlCruda !== this.ultimaAvatarUrlCruda) {
      this.ultimaAvatarUrlCruda = urlCruda;
      this.avatarErrorOcurrido = false;
      this.avatarCacheBuster = Date.now();
    }

    if (this.avatarErrorOcurrido || !urlCruda) {
      return this.avatarFallback;
    }

    const separador = urlCruda.includes('?') ? '&' : '?';
    return `${urlCruda}${separador}v=${this.avatarCacheBuster}`;
  }

  // ── Roles ──────────────────────────────────────────────────────────────────
  get esAlumno(): boolean {
    return this.sesion.rolActual === 'ALUMNO';
  }

  get esDocente(): boolean {
    return this.sesion.rolActual === 'DOCENTE';
  }

  get esTutor(): boolean {
    return this.sesion.rolActual === 'TUTOR';
  }

  getNombreDisplay(): string {
    return this.sesion.getNombreDisplay();
  }

  getEmailDisplay(): string {
    if (this.sesion.tutor) return this.sesion.tutor.parentesco;
    return this.sesion.usuario?.email || '';
  }

  onErrorImagen() {
    this.avatarErrorOcurrido = true;
  }

  async cerrarSesion() {
    const alert = await this.alertCtrl.create({
      header: 'Cerrar sesión',
      message: '¿Seguro que quieres cerrar tu sesión?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Cerrar sesión',
          role: 'destructive',
          handler: async () => {
            await this.menuCtrl.close();
            this.sesion.cerrarSesion();
            this.router.navigate(['/login']);
          },
        },
      ],
    });
    await alert.present();
  }

  async iniciarSesion(username: string, password: string): Promise<boolean> {
    return this.sesion.iniciarSesion(username, password);
  }

  // ── Badge "HOY" ────────────────────────────────────────────────────────────
  private async chequearAsistenciaPendienteHoy() {
    try {
      const uid = this.sesion.usuario?.id;
      const token = this.sesion.usuario?.token;

      if (!uid || !token) return;

      const { data: relGrupos, error: errRG } = await this.sesion.supabase
        .rpc('grupos_del_docente', { p_token: token });

      if (errRG) {
        console.error('❌ Error cargando grupos docente (RPC):', errRG.message);
        return;
      }

      const grupoIds = [...new Set((relGrupos || []).map((r: any) => r.grupo_id))];
      if (!grupoIds.length) return;

      const { data: relMaterias, error: errRM } = await this.sesion.supabase
        .rpc('materias_del_docente', { p_token: token });

      if (errRM) {
        console.error('❌ Error cargando asignaturas docente (RPC):', errRM.message);
        return;
      }

      const materiaIds = [...new Set((relMaterias || []).map((r: any) => r.asignatura_id))];
      if (!materiaIds.length) return;

      const { data: relAG } = await this.sesion.supabase
        .rpc('combos_asignatura_grupo_docente', { p_token: token, p_docente_id: uid });

      const combos = new Set((relAG || []).map((r: any) => `${r.asignatura_id}-${r.grupo_id}`));
      if (combos.size === 0) return;

      const hoy = new Date().toISOString().split('T')[0];
      const { data: asistHoy } = await this.sesion.supabase
        .rpc('combos_con_lista', { p_token: token, p_grupo_ids: grupoIds, p_materia_ids: materiaIds, p_fecha: hoy });

      const combosConLista = new Set((asistHoy || []).map((a: any) => `${a.asignatura_id}-${a.grupo_id}`));

      this.hayAsistenciaPendienteHoy = [...combos].some(c => !combosConLista.has(c));
      console.log('✅ Badge "HOY" actualizado:', this.hayAsistenciaPendienteHoy);
    } catch (err) {
      console.error('❌ Error en chequearAsistenciaPendienteHoy:', err);
      this.hayAsistenciaPendienteHoy = false;
    }
  }
}