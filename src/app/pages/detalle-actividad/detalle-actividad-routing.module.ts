import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { DetalleActividadPage } from './detalle-actividad.page';

const routes: Routes = [
  {
    path: '',
    component: DetalleActividadPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DetalleActividadPageRoutingModule {}
