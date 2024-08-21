/*
-------------------------------------------------------------------------------

Description: This script preps the file before exporting. It will export all Scene Quicktimes,
export the entire project, and organize the exported files into their respective folders.

Author: Christina Cho
Created: 2024/05/17
Version: v.1.2
 
-------------------------------------------------------------------------------
*/

function ExportCleans() {
	const storyboard = new StoryboardManager();
	const selection = new SelectionManager();
	const exp = new ExportManager;
	const cm = new MotionManager();
	const fm = new FunctionManager();
	const lm = new LayerManager();
	const dir = new Dir();

	MessageLog.clearLog()
	MessageLog.setDebug(true);

	var userPath = FileDialog.getSaveFileName('*.sbpz', 'Select export path and filename');

	if (!userPath) return;

	const file = new File(userPath);
	var baseName = file.baseName;
	var exportPath = file.path;

	if (!validateFileName(baseName)) return;

	var parsed = parseFileName(baseName);
	var sequence = parsed.sequence;
	var version = parsed.version;
	MessageLog.debug('sequence: ' + sequence + ', version: ' + version);
	
	checkFrameRate();
	checkSequence(sequence);
	renameScenesAndPanels();
	var directories = createDirectories(exportPath);
	exportMov(directories.cleansExportPath, directories.movExportPath, baseName, version);
	conformationExportAll(directories.cleansExportPath, baseName, version);
	organizeFiles(
		directories.cleansExportPath,
		directories.panelsExportPath,
		directories.audioExportPath
	);
	detectMotionLayerScenes(directories.cleansExportPath);

	function validateFileName(baseName) {
		if (baseName === 'Untitled') {
			MessageBox.information('No filename given.');
			return false;
		}
		return true;
	}

	function parseFileName(baseName) {
		var fileNameSplit = baseName.split('_');
		var sequence = fileNameSplit[1].replace('SQ', '');
		var version = fileNameSplit[fileNameSplit.length-1];
		return {
			sequence: sequence,
			version: version
		};
	}

	function checkFrameRate() {
		var frameRate = scene.getFrameRate();
		var frameRateRounded = Math.round(frameRate * 1000) / 1000

		if (frameRateRounded != 23.976) {
			scene.setFrameRate(23.976);
			MessageLog.trace('Frame rate changed to 23.976')
		}
	}

	function checkSequence(sequenceNum) {
		var numberOfSequences = storyboard.numberOfSequencesInProject();
		
		if (numberOfSequences > 1) {
			preferences.setBool('ST_ENABLE_ACT', true);
			selection.setPanelSelection(allPanelsInProject());
			
			Action.perform('onActionJoinSelectedActs()', 'sceneUI()');
			MessageLog.debug('Merged all Acts in project.');

			Action.perform('onActionJoinSelectedSequences()', 'sceneUI()');
			MessageLog.debug('More than one sequence detected. Merged all sequences.');

			preferences.setBool('ST_ENABLE_ACT', false);

		} else if (numberOfSequences < 1) {
			selection.setPanelSelection(allPanelsInProject());
			Action.perform('onActionCreateSequenceFromSelection()', 'sceneUI()');
			MessageLog.debug('No sequences detected. Created a new sequence.');
		}

		var sequenceId = storyboard.sequenceInProject(0);
		var nameOfSequenceInSBP = storyboard.nameOfSequence(sequenceId)
		
		if (nameOfSequenceInSBP != sequenceNum) {
			storyboard.renameSequence(sequenceId, sequenceNum);
			MessageLog.debug('Incorrect sequence detected. Renamed sequence.');
		}
	}

	function renameScenesAndPanels() {
		var numberOfScenesInProject = storyboard.numberOfScenesInProject();

		preferences.setBool('ST_PANEL_NAME_ALLOW_CUSTOM', true);
		Action.perform('onActionUnLockNames()', 'sceneUI()');

		for (var i = 0; i < numberOfScenesInProject; i++) {
			var sceneId = storyboard.sceneInProject(i);
			storyboard.renameScene(sceneId, i + 1);

			var numberOfPanelsInScene = storyboard.numberOfPanelsInScene(sceneId);

			for (var panel = 0; panel < numberOfPanelsInScene; panel++) {
				var panelId = storyboard.panelInScene(sceneId, panel);
				storyboard.renamePanel(panelId, panel + 1);
			}
		}
	}

	function exportMov(cleansExportPath, movExportPath, baseName, version) {
		var filePattern = "SQ%0q_Sc%0s_" + version;
		var format = "mov"; 

		exp.setExportResolution(1920, 1080);
		exp.setOneMovieClipPer('scene');
		exp.exportToMovie(movExportPath, filePattern, format);
		exp.setOneMovieClipPer('project');
		exp.exportToMovie(cleansExportPath, baseName, format);
	}

	function conformationExportAll(cleansExportPath, baseName, version) {
		var exportPreferences = {
			'EXPORT_CONFORMATION_EXPORT_PATH' : cleansExportPath + '/' + baseName,
			'EXPORT_CONFORMATION_EXPORT_PATH_PATTERN' : 'SQ%0q_Sc%0s_Pn%0p_' + version,
			'EXPORT_CONFORMATION_BITMAP_FORMAT' : 'png'
		}

		preferences.setInt('EXPORT_CONFORMATION_TARGET_FORMAT', 0) // 0 is Final Cut Pro XML

		for (var pref in exportPreferences) {
			preferences.setString(pref, exportPreferences[pref]);
		}
		
		Action.perform('onActionConformationExportAll()', 'sceneUI()');
	}

	function createDirectories(exportPath) {
		var todayDate = getDate();
		var folderName = todayDate + '_CLEANS';
		dir.path = exportPath;
		var folderVersion = 2;

		while (dir.fileExists(folderName)) {
			var folderName = todayDate + '_CLEANS' + '_' + padNumber(folderVersion);
			++folderVersion;
		}

		dir.mkdir(folderName);
		var cleansExportPath = dir.filePath(folderName)
		dir.cd(folderName);

		dir.mkdir('Scene Quicktimes');
		dir.mkdir('Panels');
		dir.mkdir('Audio');

		return {
			cleansExportPath: cleansExportPath,
			movExportPath: dir.filePath('Scene Quicktimes'),
			panelsExportPath: dir.filePath('Panels'),
			audioExportPath: dir.filePath('Audio')
		}
	}

	function organizeFiles(cleansExportPath, panelsExportPath, audioExportPath) {
		var supportedAudioFormats = ['*.wav', '*.aif', '*.aiff', '*.mp3']
		var audioFiles = [];
		dir.path = cleansExportPath;

		var panels = dir.entryList('*.png');
		for (var i = 0; i < panels.length; i++){
			dir.path = cleansExportPath
			var oldPath = dir.filePath(panels[i]);
			dir.path = panelsExportPath;
			var newPath = dir.filePath(panels[i]);
			dir.rename(oldPath, newPath);
		}

		for (var format = 0; format < supportedAudioFormats.length; format++) {
			dir.path = cleansExportPath
			var list = dir.entryList(supportedAudioFormats[format]);
			for (var audio = 0; audio < list.length; audio++) {
				audioFiles.push(list[audio]);
			}
		}

		MessageLog.debug(audioFiles);
		if (audioFiles.length == 0) return;

		for (var i = 0; i < audioFiles.length; i++) {
			dir.path = cleansExportPath
			var oldPath = dir.filePath(audioFiles[i]);
			dir.path = audioExportPath;
			var newPath = dir.filePath(audioFiles[i]);
			dir.rename(oldPath, newPath);
		}
	}

	function detectMotionLayerScenes(cleansExportPath) {
		dir.path = cleansExportPath;
		var motionLayers = ['SCENES WITH MOTION LAYERS: '];
		var panelIdInProject = allPanelsInProject();
		var motionLayerFilePath = dir.filePath('_MotionLayers.txt')
		
		for (var panel = 0; panel < panelIdInProject.length; panel++) {
			for (var layer = 0; layer < lm.numberOfLayers(panelIdInProject[panel]); layer++) {
				var foc = cm.linkedLayerFunction(panelIdInProject[panel], layer, 'skew');
				var numOfPoints = fm.numberOfPoints(panelIdInProject[panel], foc);
	
				MessageLog.debug('panelID: ' + panelIdInProject[panel] + 'layer index: '+ layer);
				MessageLog.debug('number of points: ' + numOfPoints);
	
				if (numOfPoints > 1) {
					var sceneId = storyboard.sceneIdOfPanel(panelIdInProject[panel]);
					var sceneName = storyboard.nameOfScene(sceneId);
					motionLayers.push(sceneName)
				}
			}
		}
	
		if (motionLayers.length == 1) return;

		var motionLayerFile = new File(motionLayerFilePath);
		motionLayerFile.open(2)
		motionLayerFile.writeLine(motionLayers);
		motionLayerFile.close();
	}

	function allPanelsInProject() {
		var panelIdInProject = [];
		var numberOfPanelsInProject = storyboard.numberOfPanelsInProject();

		for (var panel = 0; panel < numberOfPanelsInProject; panel++) {
			var panelId = storyboard.panelInProject(panel);
			panelIdInProject.push(panelId);
		}

		return panelIdInProject;
	}

	function getDate() {
		const date = new Date();
		var day = padNumber(date.getDate());
		var month = padNumber(date.getMonth() + 1);
		var year = date.getFullYear() % 100;

		MessageLog.debug(month + day + year)
		return month + day + year
	}

	function padNumber(num) {
		if (num.toString().length < 2) {
			num = '0' + num.toString();
		}
		return num;
	}
}