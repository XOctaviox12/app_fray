import { NgModule } from '@angular/core';
import { NoPreloading, RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';
import { GuestGuard } from '../app//guards/guest.guard';

const routes: Routes = [
  {
    // Con sesión entra directo a /inicio; sin sesión, AuthGuard lo manda a /login.
    path: '',
    redirectTo: 'inicio',
    pathMatch: 'full'
  },

  // ── Pública: si ya hay sesión, GuestGuard manda a /inicio ──
  {
    path: 'login',
    canActivate: [GuestGuard],
    loadChildren: () => import('./pages/login/login.module').then(m => m.LoginPageModule)
  },

  // ── Protegidas: requieren sesión ──
  {
    path: 'inicio',
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/inicio/inicio.module').then(m => m.InicioPageModule)
  },
  {
    path: 'tareas',
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/tareas/tareas.module').then(m => m.TareasPageModule)
  },
  {
    path: 'tareas/:id',
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/detalle-tarea/detalle-tarea.module').then(m => m.DetalleTareaPageModule)
  },
  {
    path: 'comunidad',
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/comunidad/comunidad.module').then(m => m.ComunidadPageModule)
  },
  {
    path: 'materias',
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/materias/materias.module').then(m => m.MateriasPageModule)
  },
  {
    path: 'apoyo',
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/apoyo/apoyo.module').then(m => m.ApoyoPageModule)
  },
  {
    path: 'actividad',
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/actividad/actividad.module').then(m => m.ActividadPageModule)
  },
  {
    path: 'detalle-actividad/:id',
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/detalle-actividad/detalle-actividad.module').then(m => m.DetalleActividadPageModule)
  },
  {
    path: 'perfil',
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/perfil/perfil.module').then(m => m.PerfilPageModule)
  },
  {
    path: 'herramientas',
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/herramientas/herramientas.module').then(m => m.HerramientasPageModule)
  },
  {
    path: 'aula',
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/aula/aula.module').then(m => m.AulaPageModule)
  },
  {
    path: 'asistencia',
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/asistencia/asistencia.module').then(m => m.AsistenciaPageModule)
  },
  {
    path: 'clase',
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/clase/clase.module').then(m => m.ClasePageModule)
  },
  {
    path: 'mi-hijo/:id',
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/mi-hijo/mi-hijo.module').then(m => m.MiHijoPageModule)
  },
  {
    path: 'tareas-hijo',
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/tareas-hijo/tareas-hijo.module').then(m => m.TareasHijoPageModule)
  },

  // Cualquier ruta desconocida pasa por inicio (y de ahí, por los guards)
  {
    path: '**',
    redirectTo: 'inicio'
  }
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: NoPreloading })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule {}
