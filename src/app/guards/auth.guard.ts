import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { SesionService } from '../services/sesion.service';

/**
 * Protege todas las rutas excepto /login.
 * Si no hay sesión local válida, redirige a /login.
 */
@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(private sesion: SesionService, private router: Router) {}

canActivate(): boolean | UrlTree {
  if (this.sesion.loggedIn && (this.sesion.usuario || this.sesion.tutor)) {
    return true;
  }
  return this.router.parseUrl('/login');
}
}
