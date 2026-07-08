import { NgModule, Pipe, PipeTransform } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { MateriasPageRoutingModule } from './materias-routing.module';
import { MateriasPage } from './materias.page';

// ── Pipes definidos aquí mismo para evitar problemas de tsconfig ──────────────

@Pipe({ name: 'sumField', standalone: false })
export class SumFieldPipe implements PipeTransform {
  transform(items: any[], field: string): number {
    if (!items?.length) return 0;
    return items.reduce((acc, item) => acc + (item[field] ?? 0), 0);
  }
}

@Pipe({ name: 'filterPendientes', standalone: false })
export class FilterPendientesPipe implements PipeTransform {
  transform(items: any[]): any[] {
    if (!items?.length) return [];
    return items.filter(m => m.tareasPendientes > 0);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    MateriasPageRoutingModule,
  ],
  declarations: [
    MateriasPage,
    SumFieldPipe,
    FilterPendientesPipe,
  ],
})
export class MateriasPageModule {}