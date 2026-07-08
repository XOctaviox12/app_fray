import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { TareasHijoPage } from './tareas-hijo.page';

const routes: Routes = [
  {
    path: '',
    component: TareasHijoPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class TareasHijoPageRoutingModule {}
