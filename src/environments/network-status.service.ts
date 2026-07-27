import { Injectable, NgZone } from '@angular/core';
import { Network, ConnectionStatus } from '@capacitor/network';
import { BehaviorSubject } from 'rxjs';

/**
 * Servicio de estado de red para la app FRAY (Ionic/Angular + Capacitor).
 *
 * Esto NO es un fix de IPv4/IPv6 -- eso ya lo maneja el sistema operativo
 * y la librería de Supabase automáticamente. Esto es para que la app avise
 * al usuario cuando de verdad no hay conexión a internet (wifi del plantel
 * cortado, cambio a datos móviles sin señal, etc.), en vez de que una
 * pantalla se quede cargando sin explicación.
 *
 * Uso: inyecta este servicio donde necesites saber si hay conexión antes
 * de hacer una llamada a Supabase, o suscríbete a `online$` para mostrar
 * un banner de "sin conexión" en el layout principal.
 */
@Injectable({ providedIn: 'root' })
export class NetworkStatusService {
  private readonly onlineSubject = new BehaviorSubject<boolean>(true);
  /** Emite true/false cada vez que cambia el estado de conexión. */
  readonly online$ = this.onlineSubject.asObservable();

  constructor(private ngZone: NgZone) {
    this.init();
  }

  private async init() {
    const status = await Network.getStatus();
    this.onlineSubject.next(status.connected);

    Network.addListener('networkStatusChange', (status: ConnectionStatus) => {
      // Los listeners de Capacitor corren fuera de la zona de Angular;
      // sin esto, el cambio no dispara detección de cambios en la UI.
      this.ngZone.run(() => {
        this.onlineSubject.next(status.connected);
      });
    });
  }

  get isOnline(): boolean {
    return this.onlineSubject.value;
  }
}
