import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  },
  {
    path: 'inicio',
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/inicio/inicio.module').then( m => m.InicioPageModule)
  },
  {
    path: 'tareas',
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/tareas/tareas.module').then( m => m.TareasPageModule)
  },
  {
    path: 'comunidad',
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/comunidad/comunidad.module').then( m => m.ComunidadPageModule)
  },
  {
    path: 'materias',
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/materias/materias.module').then( m => m.MateriasPageModule)
  },
  {
    path: 'apoyo',
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/apoyo/apoyo.module').then( m => m.ApoyoPageModule)
  },
  {
    path: 'actividad',
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/actividad/actividad.module').then( m => m.ActividadPageModule)
  },
  {
    path: 'perfil',
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/perfil/perfil.module').then( m => m.PerfilPageModule)
  },
  {
    path: 'herramientas',
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/herramientas/herramientas.module').then( m => m.HerramientasPageModule)
  },
  {
    path: 'aula',
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/aula/aula.module').then( m => m.AulaPageModule)
  },
  {
    path: 'login',
    loadChildren: () => import('./pages/login/login.module').then( m => m.LoginPageModule)
  },
  {
    path: 'mi-hijo',
    loadChildren: () => import('./pages/mi-hijo/mi-hijo.module').then( m => m.MiHijoPageModule)
  },
  {
    path: 'tareas-hijo',
    loadChildren: () => import('./pages/tareas-hijo/tareas-hijo.module').then( m => m.TareasHijoPageModule)
  },
  {
    path: 'asistencia',
    loadChildren: () => import('./pages/asistencia/asistencia.module').then( m => m.AsistenciaPageModule)
  },
  {
    path: 'clase',
    loadChildren: () => import('./pages/clase/clase.module').then( m => m.ClasePageModule)
  },
    {
  path: 'tareas/:id',
  loadChildren: () => import('./pages/detalle-tarea/detalle-tarea.module').then(m => m.DetalleTareaPageModule)
},
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule {}
