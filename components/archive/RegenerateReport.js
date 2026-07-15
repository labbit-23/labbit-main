// File: /components/archive/RegenerateReport.js
// Regenerate an approximate PDF for an archived requisition and download it.

'use client';

import React, { useState } from 'react';
import { Button, useToast } from '@chakra-ui/react';

export default function RegenerateReport({ mrno, reqno, size = 'xs' }) {
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const regenerate = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/archive/patient/${encodeURIComponent(mrno)}/reports/regenerate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requisition_id: reqno }),
        },
      );
      if (!res.ok) throw new Error((await res.json()).detail || res.statusText);
      const data = await res.json();

      const bytes = Uint8Array.from(atob(data.pdf_base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `archive_${mrno}_${reqno}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: 'Report regenerated from archive',
        description: 'Approximate reconstruction — watermarked as archived data.',
        status: 'success',
      });
    } catch (err) {
      toast({ title: 'Regeneration failed', description: err.message, status: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button size={size} variant="outline" onClick={regenerate} isLoading={loading}>
      Regenerate report
    </Button>
  );
}
