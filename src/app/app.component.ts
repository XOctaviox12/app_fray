import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, MenuController } from '@ionic/angular';
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

  // Año dinámico para el footer del menú (antes estaba fijo en "2025").
  currentYear = new Date().getFullYear();

  // Fallback real de avatar: si la imagen falla en tiempo real (URL rota,
  // Cloudinary/Supabase caído, etc.) se conmuta a un avatar local por defecto.
  private avatarFallback = 'assets/img/usuario.png';
  private avatarErrorOcurrido = false;

  // Guarda la última URL "cruda" (sin cache-busting) que devolvió el
  // servicio de sesión. Sirve para detectar cuándo el usuario cambió su
  // foto de perfil: si la URL cambió, reseteamos el estado de error y
  // regeneramos el parámetro de cache-busting.
  private ultimaAvatarUrlCruda: string | null = null;
  private avatarCacheBuster = 0;

  // Badge "HOY" real: se calcula revisando si falta tomar asistencia hoy
  // en algún grupo+materia del docente. Antes estaba encendido siempre.
  hayAsistenciaPendienteHoy = false;

  // Badge "LIVE": no tenemos todavía ninguna tabla ni mecanismo real que
  // indique si hay una clase en vivo activa en este momento (no ha
  // aparecido ese módulo en el proyecto). Se deja apagado por default en
  // vez de mostrar "LIVE" fijo sin que signifique nada real. Conectar
  // aquí en cuanto exista esa función.
  hayClaseEnVivoActiva = false;

  // Estado de conexión a internet, para mostrar un banner/alerta en el
  // layout cuando el usuario se quede sin red (wifi del plantel caído,
  // sin señal de datos móviles, etc.).
  sinConexion = false;
  private networkSub?: Subscription;

  constructor(
    private router: Router,
    private sesion: SesionService,
    private alertCtrl: AlertController,
    private menuCtrl: MenuController,
    private networkStatus: NetworkStatusService,
  ) {}

  ngOnInit() {
    // La sesión local ya se carga dentro del constructor de SesionService.
    if (this.esDocente) this.chequearAsistenciaPendienteHoy();

    this.networkSub = this.networkStatus.online$.subscribe(isOnline => {
      this.sinConexion = !isOnline;
    });
  }

  ngOnDestroy() {
    this.networkSub?.unsubscribe();
  }

  get usuario(): Usuario | null {
    return this.sesion.usuario;
  }

  get loggedIn(): boolean {
    return this.sesion.loggedIn;
  }

  get avatarUrl(): string {
    const urlCruda = this.sesion.getAvatarUrl();

    // Si la URL cambió respecto a la última vez (ej. se subió una foto
    // nueva), reseteamos el flag de error para no quedar pegados en el
    // fallback para siempre, y renovamos el cache-buster.
    if (urlCruda !== this.ultimaAvatarUrlCruda) {
      this.ultimaAvatarUrlCruda = urlCruda;
      this.avatarErrorOcurrido = false;
      this.avatarCacheBuster = Date.now();
    }

    if (this.avatarErrorOcurrido || !urlCruda) {
      return this.avatarFallback;
    }

    // Cache-busting: si el storage reutiliza el mismo nombre de archivo
    // al subir una foto nueva, la URL pública queda idéntica y el
    // navegador puede servir la imagen vieja desde caché. Se agrega un
    // parámetro de versión que solo cambia cuando la URL cruda cambia.
    const separador = urlCruda.includes('?') ? '&' : '?';
    return `${urlCruda}${separador}v=${this.avatarCacheBuster}`;
  }

  // ── Helpers de rol para el menú dinámico ────────────────────────────
  // La app es solo para alumnos, docentes y tutores — se quitan COORD y
  // DIRECTOR, que antes hacían que esDocente() fuera true para esos
  // roles también.
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

  /** Se mantiene este método porque login.page.ts lo invoca tal cual. */
  async iniciarSesion(username: string, password: string): Promise<boolean> {
    return this.sesion.iniciarSesion(username, password);
  }

  // ══════════════════════════════════════════════════════════════════
  // Badge "HOY" — revisa si falta tomar asistencia en alguna
  // combinación materia+grupo del docente, para el día de hoy.
  // ══════════════════════════════════════════════════════════════════
  private async chequearAsistenciaPendienteHoy() {
    try {
      const uid = this.sesion.usuario?.id;
      if (!uid) return;

      const { data: relGrupos, error: errRG } = await this.sesion.supabase
        .from('users_docentegrupo').select('grupo_id').eq('docente_id', uid).eq('activo', true);
      if (errRG) { console.error('Error grupos docente:', errRG.message); return; }
      const grupoIds = [...new Set((relGrupos || []).map((r: any) => r.grupo_id))];
      if (!grupoIds.length) return;

const { data: relMaterias, error: errRM } = await this.sesion.supabase
  .from('users_docentegrupo').select('asignatura_id').eq('docente_id', uid).eq('activo', true);
if (errRM) { console.error('Error materias docente:', errRM.message); return; }
      const materiaIds = [...new Set((relMaterias || []).map((r: any) => r.asignatura_id))];
      if (!materiaIds.length) return;

      const { data: relAG } = await this.sesion.supabase.rpc('combos_asignatura_grupo_docente', { p_token: (this.sesion.usuario?.token || this.sesion.tutor?.token), p_docente_id: uid });

      const combos = new Set((relAG || []).map((r: any) => `${r.asignatura_id}-${r.grupo_id}`));
      if (combos.size === 0) return;

      const hoy = new Date().toISOString().split('T')[0];
      const token = this.sesion.usuario?.token;
      const { data: asistHoy } = token
        ? await this.sesion.supabase.rpc('combos_con_lista', { p_token: token, p_grupo_ids: grupoIds, p_materia_ids: materiaIds, p_fecha: hoy })
        : { data: [] as any[] };

      const combosConLista = new Set((asistHoy || []).map((a: any) => `${a.asignatura_id}-${a.grupo_id}`));

      this.hayAsistenciaPendienteHoy = [...combos].some(c => !combosConLista.has(c));
    } catch {
      this.hayAsistenciaPendienteHoy = false;
    }
  }
}
