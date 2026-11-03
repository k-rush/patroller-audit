import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Incident } from './dispatch';

// Summit West base area, not the neighboring Central or Alpental ski areas.
export const SUMMIT_WEST: L.LatLngTuple = [47.4206, -121.4213];

interface Props {
  incidents: Incident[];
  selected: Incident | undefined;
  onSelect: (id: string) => void;
  onCreate: (latitude: number, longitude: number) => void;
  disabled: boolean;
}

export default function DispatchMap({ incidents, selected, onSelect, onCreate, disabled }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const callbacks = useRef({ onCreate, onSelect, disabled });
  useEffect(() => { callbacks.current = { onCreate, onSelect, disabled }; }, [onCreate, onSelect, disabled]);

  useEffect(() => {
    const instance = L.map(host.current!, { zoomControl: false }).setView(SUMMIT_WEST, 15);
    map.current = instance;
    L.control.zoom({ position: 'bottomleft' }).addTo(instance);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(instance);
    tiles.on('tileerror', () => host.current?.setAttribute('data-tiles-unavailable', 'true'));
    instance.on('click', (event: L.LeafletMouseEvent) => {
      if (!callbacks.current.disabled)
        callbacks.current.onCreate(event.latlng.lat, event.latlng.lng);
    });
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(host.current!);
    return () => { resize.disconnect(); instance.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const markers = L.layerGroup().addTo(map.current!);
    for (const [index, incident] of incidents.entries()) {
      const active = selected?.id === incident.id;
      const marker = L.marker([incident.latitude, incident.longitude], {
        title: `Incident ${incident.id}`,
        zIndexOffset: (active ? incidents.length + 1 : incidents.length - index) * 1000,
        icon: L.divIcon({
          className: `incident-marker${active ? ' selected' : ''}`,
          html: `<span>${index + 1}</span>`, iconSize: [34, 34], iconAnchor: [17, 34],
        }),
      }).addTo(markers);
      marker.on('click', () => callbacks.current.onSelect(incident.id));
    }
    return () => { markers.remove(); };
  }, [incidents, selected]);

  useEffect(() => {
    if (selected) map.current?.panTo([selected.latitude, selected.longitude]);
  }, [selected]);

  return <>
    <div ref={host} className="dispatch-map" aria-label="Summit West incident map" />
    <div className="map-tools">
      <button onClick={() => map.current?.setView(SUMMIT_WEST, 15)}>Recenter resort</button>
      <button disabled={disabled} onClick={() => {
        const center = map.current!.getCenter();
        onCreate(center.lat, center.lng);
      }}>Create at map center</button>
    </div>
    <p className="tile-warning">Map tiles unavailable. Check your connection; do not rely on the blank map for location.</p>
  </>;
}
