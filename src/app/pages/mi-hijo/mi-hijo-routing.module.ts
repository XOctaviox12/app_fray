import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { MiHijoPage } from './mi-hijo.page';

const routes: Routes = [
  {
    path: '',
    component: MiHijoPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MiHijoPageRoutingModule {}
