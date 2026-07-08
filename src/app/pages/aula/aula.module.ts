import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { AulaPageRoutingModule } from './aula-routing.module';
import { AulaPage } from './aula.page';
import { DetallePage } from './detalle/detalle.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AulaPageRoutingModule
  ],
  declarations: [AulaPage, DetallePage]
})
export class AulaPageModule {}
