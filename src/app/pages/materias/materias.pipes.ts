import { Pipe, PipeTransform, NgModule } from '@angular/core';

// Suma un campo numérico de un array de objetos
// Uso: {{ materiasDocente | sumField:'tareasPub' }}
@Pipe({ name: 'sumField', standalone: false })
export class SumFieldPipe implements PipeTransform {
  transform(items: any[], field: string): number {
    if (!items?.length) return 0;
    return items.reduce((acc, item) => acc + (item[field] ?? 0), 0);
  }
}

// Filtra materias del alumno que tienen tareas pendientes
// Uso: *ngFor="let m of materiasAlumno | filterPendientes"
@Pipe({ name: 'filterPendientes', standalone: false })
export class FilterPendientesPipe implements PipeTransform {
  transform(items: any[]): any[] {
    if (!items?.length) return [];
    return items.filter(m => m.tareasPendientes > 0);
  }
}

