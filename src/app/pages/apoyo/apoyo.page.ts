import { Component, OnInit } from '@angular/core';

@Component({
  standalone: false,
  selector: 'app-apoyo',
  templateUrl: './apoyo.page.html',
  styleUrls: ['./apoyo.page.scss'],
})
export class ApoyoPage implements OnInit {

  constructor() { }

  ngOnInit() {
  }

  // Método para abrir recursos
  openResource(resourceId: string) {
    console.log('Abriendo recurso:', resourceId);
    // Aquí puedes implementar la lógica para abrir videos o PDFs
    // Por ejemplo: window.open(url, '_blank');
  }

}
