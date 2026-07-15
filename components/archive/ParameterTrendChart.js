// File: /components/archive/ParameterTrendChart.js
// Dependency-free SVG line chart: one lab parameter over visits.
// Design per dataviz method: single series (no legend; title names it),
// 2px line, 8px markers, recessive grid, neutral normal-range band,
// out-of-range points in status-critical with ring + label (never color
// alone), crosshair tooltip, latest value direct-labeled.
// Palette validated light+dark (see shivam-archive migration notes).

'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Box, Text, useColorModeValue } from '@chakra-ui/react';

const W = 640;
const H = 180;
const PAD = { top: 16, right: 56, bottom: 26, left: 44 };

export default function ParameterTrendChart({ name, unit, refLow, refHigh, points }) {
  // points: [{ date: 'YYYY-MM-DD', value: number, outOfRange: bool }]
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);

  const seriesColor = useColorModeValue('#2a78d6', '#3987e5');
  const criticalColor = '#d03b3b'; // status-critical, passes 3:1 both modes
  const ink = useColorModeValue('#0b0b0b', '#ffffff');
  const inkMuted = useColorModeValue('#52514e', '#c3c2b7');
  const surface = useColorModeValue('#ffffff', '#1a1a19');
  const grid = useColorModeValue('#e8e7e3', '#33322f');
  const band = useColorModeValue('rgba(82,81,78,0.08)', 'rgba(195,194,183,0.10)');
  const tooltipBg = useColorModeValue('white', 'gray.700');

  const geom = useMemo(() => {
    if (!points?.length) return null;
    const values = points.map((p) => p.value);
    const lo = Math.min(...values, refLow ?? Infinity);
    const hi = Math.max(...values, refHigh ?? -Infinity);
    const span = hi - lo || 1;
    const yMin = lo - span * 0.12;
    const yMax = hi + span * 0.12;
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    // Equal spacing per visit (discrete clinical events, not continuous time)
    const x = (i) => PAD.left + (points.length === 1 ? innerW / 2 : (i * innerW) / (points.length - 1));
    const y = (v) => PAD.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
    return { x, y, yMin, yMax, innerW, innerH };
  }, [points, refLow, refHigh]);

  if (!geom) return null;
  const { x, y, yMin, yMax } = geom;

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(' ');

  const gridLines = [0.25, 0.5, 0.75].map((f) => {
    const v = yMin + (yMax - yMin) * f;
    return { v, yy: y(v) };
  });

  const last = points[points.length - 1];

  const onMove = (evt) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((evt.clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    }
    setHover(best);
  };

  return (
    <Box mb={5}>
      <Text fontSize="sm" fontWeight="semibold" mb={1} color={ink}>
        {name}{' '}
        <Text as="span" color={inkMuted} fontWeight="normal">
          {unit ? `(${unit})` : ''}{' '}
          {refLow != null && refHigh != null ? `· ref ${refLow}–${refHigh}` : ''}
        </Text>
      </Text>
      <Box position="relative" maxW={`${W}px`}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: 'auto', display: 'block', background: surface, borderRadius: 6 }}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label={`${name} trend over ${points.length} visits`}
        >
          {/* normal-range band (neutral, recessive) */}
          {refLow != null && refHigh != null && (
            <rect
              x={PAD.left} width={W - PAD.left - PAD.right}
              y={y(refHigh)} height={Math.max(y(refLow) - y(refHigh), 0)}
              fill={band}
            />
          )}
          {/* recessive grid */}
          {gridLines.map((g, i) => (
            <g key={i}>
              <line x1={PAD.left} x2={W - PAD.right} y1={g.yy} y2={g.yy} stroke={grid} strokeWidth="1" />
              <text x={PAD.left - 6} y={g.yy + 3} textAnchor="end" fontSize="9" fill={inkMuted}>
                {Number(g.v.toPrecision(3))}
              </text>
            </g>
          ))}
          {/* crosshair */}
          {hover != null && (
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke={inkMuted} strokeWidth="1" strokeDasharray="3,3" />
          )}
          {/* series line */}
          <path d={path} fill="none" stroke={seriesColor} strokeWidth="2" strokeLinejoin="round" />
          {/* markers: 8px, out-of-range = critical + ring + label */}
          {points.map((p, i) => (
            <g key={i}>
              {p.outOfRange ? (
                <>
                  <circle cx={x(i)} cy={y(p.value)} r="5.5" fill="none" stroke={criticalColor} strokeWidth="1.5" />
                  <circle cx={x(i)} cy={y(p.value)} r="3" fill={criticalColor} stroke={surface} strokeWidth="1.5" />
                  <text x={x(i)} y={y(p.value) - 9} textAnchor="middle" fontSize="9" fill={ink}>
                    {p.value}
                  </text>
                </>
              ) : (
                <circle cx={x(i)} cy={y(p.value)} r="4" fill={seriesColor} stroke={surface} strokeWidth="1.5" />
              )}
              {/* generous invisible hit target */}
              <rect
                x={x(i) - 12} y={PAD.top} width="24" height={H - PAD.top - PAD.bottom}
                fill="transparent" style={{ cursor: 'crosshair' }}
                onMouseEnter={() => setHover(i)}
              />
            </g>
          ))}
          {/* direct label: latest value only */}
          {!last.outOfRange && (
            <text x={x(points.length - 1) + 8} y={y(last.value) + 3} fontSize="10" fontWeight="600" fill={ink}>
              {last.value}
            </text>
          )}
          {/* x labels: first, middle, last visit dates */}
          {[0, Math.floor((points.length - 1) / 2), points.length - 1]
            .filter((v, i, a) => a.indexOf(v) === i)
            .map((i) => (
              <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="9" fill={inkMuted}>
                {points[i].date}
              </text>
            ))}
        </svg>
        {/* tooltip */}
        {hover != null && (
          <Box
            position="absolute"
            left={`${(x(hover) / W) * 100}%`}
            top="0"
            transform={x(hover) > W * 0.7 ? 'translate(-105%, 0)' : 'translate(8px, 0)'}
            bg={tooltipBg}
            borderWidth="1px"
            borderRadius="md"
            px={2} py={1}
            fontSize="xs"
            pointerEvents="none"
            boxShadow="sm"
            zIndex={1}
          >
            <Text fontWeight="semibold">{points[hover].date}</Text>
            <Text>
              {points[hover].value} {unit || ''}
              {points[hover].outOfRange ? ' — outside range' : ''}
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
