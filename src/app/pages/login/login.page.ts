import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AppComponent } from '../../app.component';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: false,
})
export class LoginPage {
  username = '';
  password = '';
  error = '';
  cargando = false;
  mostrarPassword = false;

  constructor(
    private appComponent: AppComponent,
    private router: Router
  ) {}

  async login() {
    if (!this.username.trim() || !this.password.trim()) {
      this.error = 'Por favor ingresa usuario y contraseña';
      return;
    }

    this.cargando = true;
    this.error = '';

    const ok = await this.appComponent.iniciarSesion(this.username.trim(), this.password.trim());

    this.cargando = false;

    if (ok) {
      this.router.navigate(['/inicio'], { replaceUrl: true });
    } else {
      this.error = 'Usuario o contraseña incorrectos';
    }
  }

  togglePassword() {
    this.mostrarPassword = !this.mostrarPassword;
  }
}
