import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { SesionService, Usuario } from '../../services/sesion.service';

@Component({
  selector: 'app-perfil',
  templateUrl: './perfil.page.html',
  styleUrls: ['./perfil.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class PerfilPage implements OnInit {
  usuario: Usuario | null = null;
  avatarUrl = 'assets/img/default-avatar.png';

  private readonly nombresRoles: Record<string, string> = {
    ADMIN: 'Administrador',
    DIRECTOR: 'Director',
    COORD: 'Coordinador',
    DOCENTE: 'Docente',
    ALUMNO: 'Estudiante',
    TUTOR: 'Tutor',
  };

  constructor(private sesion: SesionService, private router: Router) {}

  ngOnInit() {
    this.usuario = this.sesion.usuario;
    this.avatarUrl = this.sesion.getAvatarUrl();
  }

  onErrorImagen() {
    this.avatarUrl = 'assets/img/default-avatar.png';
  }

  getNombreCompleto(): string {
    if (!this.usuario) return '';
    const nombre = `${this.usuario.first_name || ''} ${this.usuario.last_name || ''}`.trim();
    return nombre || this.usuario.username;
  }

  getRolDisplay(): string {
    const rol = (this.usuario?.rol || '').toUpperCase();
    return this.nombresRoles[rol] || this.usuario?.rol || 'Sin rol asignado';
  }

  cerrarSesion() {
    this.sesion.cerrarSesion();
    this.router.navigate(['/login'], { replaceUrl: true });
  }
}
