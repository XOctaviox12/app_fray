import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { DetalleTareaPage } from './detalle-tarea.page';

const routes: Routes = [
  { path: '', component: DetalleTareaPage }
];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [DetalleTareaPage]
})
export class DetalleTareaPageModule {}
