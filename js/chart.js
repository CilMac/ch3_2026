// Module isolé : génère un graphique en barres SVG (chaîne de caractères), sans DOM.
// Fonctionnalité absente de l'appli iOS d'origine — ajoutée pour donner une vue
// de tendance plutôt que des chiffres bruts uniquement.

export function weeklyBarChartSvg(weeks, { width = 600, height = 220, threshold = 10, maxWeeks = 12 } = {}) {
  if (!weeks || weeks.length === 0) return '';

  // weeks arrive triées plus récent -> plus ancien ; on inverse pour lire de gauche (ancien) à droite (récent)
  const data = weeks.slice(0, maxWeeks).slice().reverse();

  const padding = { top: 20, right: 12, bottom: 34, left: 8 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxVal = Math.max(threshold, ...data.map((d) => d.total)) * 1.15;
  const barGap = 6;
  const barW = (chartW - barGap * (data.length - 1)) / data.length;

  const yFor = (v) => padding.top + chartH - (v / maxVal) * chartH;
  const thresholdY = yFor(threshold);

  const barColor = (total) => {
    if (total <= threshold / 2) return 'var(--green)';
    if (total <= threshold) return 'var(--wood-mid)';
    if (total <= threshold * 1.1) return 'var(--amber)';
    return 'var(--red)';
  };

  const bars = data.map((d, i) => {
    const x = padding.left + i * (barW + barGap);
    const barH = (d.total / maxVal) * chartH;
    const y = padding.top + chartH - barH;
    const label = d.weekStart.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    const valueLabel = d.total.toFixed(1).replace('.', ',');
    return `
      <text x="${x + barW / 2}" y="${Math.max(y - 4, 10)}" text-anchor="middle" class="chart-value-label">${valueLabel}</text>
      <rect x="${x}" y="${y}" width="${barW}" height="${Math.max(barH, 1)}" rx="3" fill="${barColor(d.total)}" />
      <text x="${x + barW / 2}" y="${padding.top + chartH + 16}" text-anchor="middle" class="chart-axis-label">${label}</text>
    `;
  }).join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" class="weekly-chart" role="img" aria-label="Graphique de tendance hebdomadaire" preserveAspectRatio="xMidYMid meet">
      <line x1="${padding.left}" y1="${thresholdY}" x2="${width - padding.right}" y2="${thresholdY}" class="chart-threshold-line" />
      <text x="${width - padding.right}" y="${thresholdY - 5}" text-anchor="end" class="chart-threshold-label">${threshold} U</text>
      ${bars}
    </svg>
  `;
}

// Barres génériques par catégorie (jour de semaine, type de boisson…), sans ligne de seuil.
export function categoryBarChartSvg(items, { width = 600, height = 200 } = {}) {
  const data = (items || []).filter((d) => d.total > 0);
  if (data.length === 0) return '';

  const padding = { top: 20, right: 12, bottom: 34, left: 8 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxVal = Math.max(...data.map((d) => d.total)) * 1.15;
  const barGap = 10;
  const barW = (chartW - barGap * (data.length - 1)) / data.length;

  const bars = data.map((d, i) => {
    const x = padding.left + i * (barW + barGap);
    const barH = (d.total / maxVal) * chartH;
    const y = padding.top + chartH - barH;
    const valueLabel = d.total.toFixed(1).replace('.', ',');
    return `
      <text x="${x + barW / 2}" y="${Math.max(y - 4, 10)}" text-anchor="middle" class="chart-value-label">${valueLabel}</text>
      <rect x="${x}" y="${y}" width="${barW}" height="${Math.max(barH, 1)}" rx="3" fill="var(--wood-mid)" />
      <text x="${x + barW / 2}" y="${padding.top + chartH + 16}" text-anchor="middle" class="chart-axis-label">${d.label}</text>
    `;
  }).join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" class="weekly-chart" role="img" aria-label="Graphique par catégorie" preserveAspectRatio="xMidYMid meet">
      ${bars}
    </svg>
  `;
}
