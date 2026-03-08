/****
SOC DSM Starter Repo v2 - 04_extract_pixels_to_fields.js
Extracts pixel predictions to field boundaries so Python can aggregate them.
Assumes the prediction image is already available as an EE asset.
****/

var fields = ee.FeatureCollection('projects/your-project/assets/field_boundaries');
var prediction = ee.Image('projects/your-project/assets/soc_prediction_v2');

var withFieldId = fields.map(function(f) {
  return f.set('field_id', ee.String(f.get('field_id')));
});

var pixels = prediction.sampleRegions({
  collection: withFieldId,
  properties: ['field_id'],
  scale: 10,
  geometries: true,
  tileScale: 4
});

print('Pixel sample preview', pixels.limit(5));
Map.centerObject(fields, 10);
Map.addLayer(prediction, {min: 20, max: 120}, 'Prediction');
Map.addLayer(fields.style({color: 'yellow', fillColor: '00000000'}), {}, 'Fields');

Export.table.toDrive({
  collection: pixels,
  description: 'soc_pixels_to_fields',
  fileFormat: 'CSV'
});
