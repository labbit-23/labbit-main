// app/components/DynamicLeafletMap.js
'use client';

import { useEffect, useState } from 'react';

// We'll load LeafletMap dynamically
const DynamicLeafletMap = (props) => {
  const [MapComponent, setMapComponent] = useState(null);

  useEffect(() => {
    import('./LeafletMap').then((Mod) => {
      setMapComponent(<Mod.default {...props} />);
    });
  }, [props]);

  return <div style={{ height: '100%', width: '100%' }}>{MapComponent}</div>;
};

export default DynamicLeafletMap;