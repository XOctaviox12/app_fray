import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { DetalleTareaPage } from './detalle-tarea.page';

const routes: Routes = [
  {
    path: '',
    component: DetalleTareaPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DetalleTareaPageRoutingModule {}
