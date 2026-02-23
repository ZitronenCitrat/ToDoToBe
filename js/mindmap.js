// Simple Brainstorm Mindmap Component
// Stores nodes in Firestore as a field on the list document

import { updateList } from './db.js';
import { appState } from './app.js';

export function renderMindmap(container, listId) {
    const list = appState.allLists.find(l => l.id === listId);
    const nodes = list?.mindmapNodes || [];

    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;min-height:300px';

    // Central node
    const center = document.createElement('div');
    center.className = 'glass';
    center.style.cssText = `
        position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
        padding:12px 20px;font-weight:600;font-size:14px;z-index:2;
        border-color:var(--accent);color:var(--accent);white-space:nowrap;
    `;
    center.textContent = list?.name || 'Projekt';
    wrapper.appendChild(center);

    // Child nodes in a circle
    const radius = 120;
    nodes.forEach((node, i) => {
        const angle = (2 * Math.PI * i) / Math.max(nodes.length, 1) - Math.PI / 2;
        const x = 50 + (radius / 3) * Math.cos(angle);
        const y = 50 + (radius / 2.5) * Math.sin(angle);

        const el = document.createElement('div');
        el.className = 'glass-sm';
        el.style.cssText = `
            position:absolute;left:${x}%;top:${y}%;transform:translate(-50%,-50%);
            padding:8px 14px;font-size:13px;z-index:2;cursor:pointer;
            max-width:140px;word-break:break-word;text-align:center;
        `;
        el.textContent = node.text;

        // Delete on long press / right click
        el.addEventListener('contextmenu', async (e) => {
            e.preventDefault();
            if (confirm(`"${node.text}" entfernen?`)) {
                const updated = nodes.filter((_, idx) => idx !== i);
                await updateList(listId, { mindmapNodes: updated });
            }
        });

        wrapper.appendChild(el);
    });

    // SVG lines connecting center to nodes
    if (nodes.length > 0) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:1';
        svg.setAttribute('preserveAspectRatio', 'none');

        nodes.forEach((_, i) => {
            const angle = (2 * Math.PI * i) / Math.max(nodes.length, 1) - Math.PI / 2;
            const x = 50 + (radius / 3) * Math.cos(angle);
            const y = 50 + (radius / 2.5) * Math.sin(angle);

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', '50%');
            line.setAttribute('y1', '50%');
            line.setAttribute('x2', `${x}%`);
            line.setAttribute('y2', `${y}%`);
            line.setAttribute('stroke', 'rgba(255,255,255,0.08)');
            line.setAttribute('stroke-width', '1');
            svg.appendChild(line);
        });

        wrapper.appendChild(svg);
    }

    container.appendChild(wrapper);

    // Add node button
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-ghost w-full mt-4 flex items-center justify-center gap-2';
    addBtn.style.fontSize = '14px';
    addBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px">add</span>Idee hinzufügen';
    addBtn.addEventListener('click', async () => {
        const text = prompt('Neue Idee:');
        if (text && text.trim()) {
            const updated = [...nodes, { text: text.trim(), id: Math.random().toString(36).substring(2, 8) }];
            await updateList(listId, { mindmapNodes: updated });
        }
    });
    container.appendChild(addBtn);
}
