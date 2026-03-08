/****
SOC DSM Starter Repo - 03_score_map.js
Trains an Earth Engine RF regressor and produces a wall-to-wall SOC prediction.
Useful for rapid mapping; for audit-grade modeling, keep Python as the source of truth.
****/

var aoi = ee.FeatureCollection('projects/your-project/assets/project_boundary');
var featureStack = ee.Image('projects/your-project/assets/soc_feature_stack_v1');
var soilPts = ee.FeatureCollection('projects/your-project/assets/soil_points_clean');

var bands = featureStack.bandNames();

var training = featureStack.sampleRegions({
  collection: soilPts,
  properties: ['soc_stock_tCha'],
  scale: 10,
  geometries: false,
  tileScale: 4
});

var rf = ee.Classifier.smileRandomForest({
  numberOfTrees: 300,
  variablesPerSplit: null,
  minLeafPopulation: 3,
  bagFraction: 0.632,
  maxNodes: null,
  seed: 42
}).setOutputMode('REGRESSION');

var trained = rf.train({
  features: training,
  classProperty: 'soc_stock_tCha',
  inputProperties: bands
});

var prediction = featureStack.classify(trained).rename('soc_stock_tCha_pred');

Map.centerObject(aoi, 10);
Map.addLayer(prediction, {min: 20, max: 120}, 'SOC stock prediction');

Export.image.toAsset({
  image: prediction,
  description: 'soc_prediction_v1_asset',
  assetId: 'projects/your-project/assets/soc_prediction_v1',
  region: aoi.geometry(),
  scale: 10,
  maxPixels: 1e13
});

// Optional: export the classifier to an asset if your EE environment supports it.
// Export.classifier.toAsset({
//   classifier: trained,
//   description: 'soc_rf_classifier_asset',
//   assetId: 'projects/your-project/assets/soc_rf_classifier_v1'
// });
