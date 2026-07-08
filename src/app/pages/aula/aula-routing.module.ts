import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { AulaPage } from './aula.page';
import { DetallePage } from './detalle/detalle.page';

const routes: Routes = [
  { path: '', component: AulaPage },
  { path: 'detalle/:id', component: DetallePage }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AulaPageRoutingModule {}
