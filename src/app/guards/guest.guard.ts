import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { SesionService } from '../services/sesion.service';

/**
 * Solo para /login.
 * Si ya hay una sesión local válida (usuario o tutor), manda directo a /inicio
 * y la pantalla de login nunca llega a mostrarse.
 */
@Injectable({
  providedIn: 'root'
})
export class GuestGuard implements CanActivate {
  constructor(private sesion: SesionService, private router: Router) {}

  async canActivate(): Promise<boolean | UrlTree> {
    await this.sesion.listo;

    const haySesion = !!(this.sesion.loggedIn && (this.sesion.usuario || this.sesion.tutor));

    return haySesion ? this.router.parseUrl('/inicio') : true;
  }
}
