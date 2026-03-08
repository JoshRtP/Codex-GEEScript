/****
SOC DSM Starter Repo - 02_sample_training_points.js
Samples the feature stack at soil point locations and exports a training table.
Assumes the soil points asset already contains the target field `soc_stock_tCha`.
****/

var aoi = ee.FeatureCollection('projects/your-project/assets/project_boundary');
var featureStack = ee.Image('projects/your-project/assets/soc_feature_stack_v1');
var soilPts = ee.FeatureCollection('projects/your-project/assets/soil_points_clean');

var training = featureStack.sampleRegions({
  collection: soilPts,
  properties: ['sample_id', 'soc_stock_tCha'],
  scale: 10,
  geometries: true,
  tileScale: 4
});

print('Training table preview', training.limit(5));
Map.centerObject(aoi, 10);
Map.addLayer(soilPts, {color: 'red'}, 'Soil points');

Export.table.toDrive({
  collection: training,
  description: 'soc_training_table',
  fileFormat: 'CSV'
});
