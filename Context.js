﻿exports.newContext = function newContext(BOT, logger, BLOB_STORAGE, UTILITIES, STATUS_REPORT) {

    let bot = BOT;

    const MODULE_NAME = "Context";

    /* 

    This module deals with keeping the context between different executions of the bot. Conceptually this context is divided in 3 main parts:

    I.  The non-business information which helps the mechanisms of giving continuety to the bots execution over time. This information goes in a file
        called the Status Report, and there is a module, child of this one called Status Report that deals with loading and saving the contents of that file.

    II. The business information around the bot execution, including its balance, positions at exchanges, trades executed and many other things. These
        are platform data mantained on behalf of the executing bot. All these is kept in one file per execution called the Execution Context. The collection
        of all these files can later reconstruct the vital business information the bot had at each moment in time.

    II. Execution of any bot cannot be guaranteed that will be on fixed interval of times. We need an index of all executions that points to the detailed files
        with all the business informatino the bot had each time it executed. We call this index the Execution History and there is one file to store it.

    */

    let thisObject = {
        statusReport: undefined,            // Here is the information that defines which was the last sucessfull execution and some other details.
        executionHistory: [],               // This is the record of bot execution.
        executionContext: undefined,        // Here is the business information of the last execution of this bot process.
        newHistoryRecord : {
            date: undefined,
            buyAvgRate: 0,
            sellAvgRate: 0,
            lastSellRate: 0,
            sellExecRate: 0,
            lastBuyRate: 0,
            buyExecRate: 0,
            marketRate: 0,
            newPositions: 0,
            newTrades: 0,
            movedPositions: 0,
            profitsAssetA: 0,
            profitsAssetB: 0,
            combinedProfitsA: 0,
            combinedProfitsB: 0,
            messageRelevance: 0,
            messageTitle: "",
            messageBody: ""
        },
        initialize: initialize,
        saveThemAll: saveThemAll,
        extraData: []
    };

    /*

    During the process we will create a new History Record. This will go to the Context History file which essentially mantains an
    index of all the bots executions. This file will later be plotted by the bot s plotter on the timeline, allowing end users to
    know where there is information related to the actions taken by the bot.

    */

    let statusReportModule;

    /* Utilities needed. */

    let utilities = UTILITIES.newCloudUtilities(bot, logger);

    /* Storage account to be used here. */

    let cloudStorage = BLOB_STORAGE.newBlobStorage(bot, logger);

    let statusDependencies;

    let runIndex;  // This is the index for this run and depends on the startMode. 

    let totalAlgobots;

    return thisObject;

    function initialize(pStatusDependencies, pTotalAlgobots, callBackFunction) {

        try {

            if (global.LOG_CONTROL[MODULE_NAME].logInfo === true) { logger.write(MODULE_NAME, "[INFO] initialize -> Entering function."); }

            statusDependencies = pStatusDependencies;
            totalAlgobots = pTotalAlgobots;

            /*

            Here we get the positions the bot did and that are recorded at the bot storage account. We will use them through out the rest
            of the process.

            */
            initializeStorage();

            function initializeStorage() {

                cloudStorage.initialize(bot.devTeam, onInizialized);

                function onInizialized(err) {

                    if (err.result === global.DEFAULT_OK_RESPONSE.result) {

                        thisObject.newHistoryRecord.date = bot.processDatetime;

                        getStatusReport(onDone);

                    } else {
                        logger.write(MODULE_NAME, "[ERROR] initialize -> initializeStorage -> onInizialized -> err = " + err.message);
                        callBackFunction(err);
                    }
                }
            }

            function onDone(err) {
                try {

                    switch (err.result) {
                        case global.DEFAULT_OK_RESPONSE.result: {
                            if (global.LOG_CONTROL[MODULE_NAME].logInfo === true) { logger.write(MODULE_NAME, "[INFO] initialize -> onDone -> Execution finished well."); }

                            callBackFunction(global.DEFAULT_OK_RESPONSE);
                            return;
                        }
                        case global.DEFAULT_RETRY_RESPONSE.result: {  // Something bad happened, but if we retry in a while it might go through the next time.
                            logger.write(MODULE_NAME, "[ERROR] initialize -> onDone -> Retry Later. Requesting Execution Retry.");
                            callBackFunction(err);
                            return;
                        }
                        case global.DEFAULT_FAIL_RESPONSE.result: { // This is an unexpected exception that we do not know how to handle.
                            logger.write(MODULE_NAME, "[ERROR] initialize -> onDone -> Operation Failed. Aborting the process.");
                            callBackFunction(err);
                            return;
                        }
                        default: {
                            logger.write(MODULE_NAME, "[ERROR] initialize -> onDone -> Operation Failed with custom response.");
                            callBackFunction(err);
                        }
                    }

                } catch (err) {
                    logger.write(MODULE_NAME, "[ERROR] initialize -> onDone -> err = " + err.message);
                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                }
            }

            function getStatusReport(callBack) {

                try {

                    if (global.LOG_CONTROL[MODULE_NAME].logInfo === true) { logger.write(MODULE_NAME, "[INFO] initialize -> getStatusReport -> Entering function."); }

                    let key = bot.devTeam + "-" + bot.codeName + "-" + bot.process + "-" + bot.dataSetVersion;

                    statusReportModule = statusDependencies.statusReports.get(key);
                    thisObject.statusReport = statusReportModule.file;

                    /* The context is created in 2 situations: 1) when at the bot config is set not to continue using the same context after a new execution. 2) when the status report does not exist. */

                    if (bot.hasTheBotJustStarted === true || thisObject.statusReport.runs === undefined) { 

                        createConext(callBack);

                    } else {

                        runIndex = thisObject.statusReport.runs.length - 1;

                        getExecutionHistory(callBack); 

                    }

                } catch (err) {
                    logger.write(MODULE_NAME, "[ERROR] initialize -> getStatusReport -> err = " + err.message);
                    callBack(global.DEFAULT_FAIL_RESPONSE);
                }
            }

            function getExecutionHistory(callBack) {

                try {

                    if (global.LOG_CONTROL[MODULE_NAME].logInfo === true) { logger.write(MODULE_NAME, "[INFO] initialize -> getExecutionHistory -> Entering function."); }

                    let fileName = "Execution.History." + bot.startMode + "." + runIndex + ".json";
                    let filePath = bot.filePathRoot + "/Output/" + bot.process;

                    if (global.LOG_CONTROL[MODULE_NAME].logInfo === true) { logger.write(MODULE_NAME, "[INFO] initialize -> getExecutionHistory -> fileName = " + fileName); }
                    if (global.LOG_CONTROL[MODULE_NAME].logInfo === true) { logger.write(MODULE_NAME, "[INFO] initialize -> getExecutionHistory -> filePath = " + filePath); }

                    cloudStorage.getTextFile(filePath, fileName, onFileReceived);

                    function onFileReceived(err, text) {

                        if (err.result !== global.DEFAULT_OK_RESPONSE.result) {
                            logger.write(MODULE_NAME, "[ERROR] initialize -> getExecutionHistory -> onFileReceived -> err = " + err.message);
                            callBack(err);
                            return;
                        }

                        if (global.LOG_CONTROL[MODULE_NAME].logContent === true) {
                            logger.write(MODULE_NAME, "[INFO] initialize -> getExecutionHistory -> onFileReceived -> Content received = " + text);
                        }

                        try {

                            thisObject.executionHistory = JSON.parse(text);

                            /* Move some values to the new record, in case there are no transactions that re-calculate them. */

                            thisObject.newHistoryRecord.buyAvgRate = thisObject.executionHistory[thisObject.executionHistory.length-1][1];
                            thisObject.newHistoryRecord.sellAvgRate = thisObject.executionHistory[thisObject.executionHistory.length - 1][2];

                            getExecutionContext(callBack);

                        } catch (err) {

                            /*

                            It might happen that the file content is corrupt or it does not exist. The bot can not run without an Execution Hitory,
                            since it is risky to ignore its own history unless it is its first execution in this mode ever. 

                            */

                            logger.write(MODULE_NAME, "[ERROR] initialize -> getExecutionHistory -> onFileReceived -> Bot cannot execute without the Execution History. -> Err = " + err.message);
                            callBack(global.DEFAULT_FAIL_RESPONSE);
                        }
                    }

                } catch (err) {
                    logger.write(MODULE_NAME, "[ERROR] initialize -> getExecutionHistory -> err = " + err.message);
                    callBack(global.DEFAULT_FAIL_RESPONSE);
                }
            }

            function getExecutionContext(callBack) {

                try {

                    if (global.LOG_CONTROL[MODULE_NAME].logInfo === true) { logger.write(MODULE_NAME, "[INFO] initialize -> getExecutionContext -> Entering function."); }

                    let date;

                    date = new Date(thisObject.statusReport.runs[runIndex].lastExecution);
                    thisObject.statusReport.runs[runIndex].lastExecution = bot.processDatetime;
                    thisObject.statusReport.runs[runIndex].endDatetime = bot.processDatetime;

                    let fileName = "Execution.Context." + bot.startMode + "." + runIndex + ".json";
                    let dateForPath = date.getUTCFullYear() + '/' + utilities.pad(date.getUTCMonth() + 1, 2) + '/' + utilities.pad(date.getUTCDate(), 2) + '/' + utilities.pad(date.getUTCHours(), 2) + '/' + utilities.pad(date.getUTCMinutes(), 2);
                    let filePath = bot.filePathRoot + "/Output/" + bot.process + '/' + dateForPath;

                    if (global.LOG_CONTROL[MODULE_NAME].logInfo === true) { logger.write(MODULE_NAME, "[INFO] initialize -> getExecutionContext -> fileName = " + fileName); }
                    if (global.LOG_CONTROL[MODULE_NAME].logInfo === true) { logger.write(MODULE_NAME, "[INFO] initialize -> getExecutionContext -> filePath = " + filePath); }

                    cloudStorage.getTextFile(filePath, fileName, onFileReceived);

                    function onFileReceived(err, text) {

                        if (err.result !== global.DEFAULT_OK_RESPONSE.result) {
                            logger.write(MODULE_NAME, "[ERROR] initialize -> getExecutionContext -> onFileReceived -> err = " + err.message);
                            callBack(err);
                            return;
                        }

                        if (global.LOG_CONTROL[MODULE_NAME].logContent === true) {
                            logger.write(MODULE_NAME, "[INFO] initialize -> getExecutionContext -> onFileReceived -> Content received = " + text);
                        }

                        try {

                            thisObject.executionContext = JSON.parse(text);
                            thisObject.executionContext.transactions = []; // We record here the transactions that happened duting this execution.

                            /* Update the new History Record, in case there are no trades during this execution that updates it. */

                            thisObject.newHistoryRecord.profitsAssetA = thisObject.executionContext.profits.assetA;
                            thisObject.newHistoryRecord.profitsAssetB = thisObject.executionContext.profits.assetB;

                            thisObject.newHistoryRecord.combinedProfitsA = thisObject.executionContext.combinedProfits.assetA;
                            thisObject.newHistoryRecord.combinedProfitsB = thisObject.executionContext.combinedProfits.assetB;

                            callBack(global.DEFAULT_OK_RESPONSE);

                        } catch (err) {

                            /*

                            It might happen that the file content is corrupt or it does not exist. The bot can not run without a Status Report,
                            since it is risky to ignore its own execution history. Execpt when the bot is running for the fist time in this mode,
                            an execution context file with the right format is needed.

                            */

                            logger.write(MODULE_NAME, "[ERROR] initialize -> getExecutionContext -> onFileReceived -> Bot cannot execute without the Execution Context. -> Err = " + err.message);
                            callBack(global.DEFAULT_FAIL_RESPONSE);
                        }
                    }

                } catch (err) {
                    logger.write(MODULE_NAME, "[ERROR] initialize -> getExecutionContext -> err = " + err.message);
                    callBack(global.DEFAULT_FAIL_RESPONSE);
                }
            }

            function createConext(callBack) {

                try {
                    if (global.LOG_CONTROL[MODULE_NAME].logInfo === true) { logger.write(MODULE_NAME, "[INFO] initialize -> createConext -> Entering function."); }
                    /*
    
                    When the bot is executed for the very first time, there are a few files that do not exist and need to be created, and that
                    content is what we are going to set up now.
    
                    */

                    if (thisObject.statusReport.runs === undefined) { // This means that the Status Report does not exist.

                        thisObject.statusReport.runs = [];
                    } 

                    let runContent = {
                        beginDatetime: bot.processDatetime,
                        endDatetime: bot.processDatetime,
                        lastExecution: bot.processDatetime
                    };

                    thisObject.statusReport.runs.push(runContent);
                    runIndex = thisObject.statusReport.runs.length - 1;

                    thisObject.executionHistory = [];

                    /*
                    In the current release, the platform is going to be used for the first competition, so we have a few parameters just for that. They will be removed later
                    once we advance into multiple competitions scheme.
                    */

					const INITIAL_INVESTMENT_A = 0;                                 // This is just for this release of the platform.
                    const INITIAL_INVESTMENT_B = truncDecimals(.001 / totalAlgobots);              // This is just for this release of the platform.

                    thisObject.executionContext = {
                        investment: {                               // This is used to calculate profits. 
                            assetA: INITIAL_INVESTMENT_A,
                            assetB: INITIAL_INVESTMENT_B
                        },
                        balance: {                                  // This is the total balance that includes positions at the order book + funds available to be traded. 
                            assetA: INITIAL_INVESTMENT_A,
                            assetB: INITIAL_INVESTMENT_B              // It starts with the initial investment.
                        },
                        availableBalance: {                         // This is the balance the bot has at any moment in time available to be traded (not in positions at the order book). 
                            assetA: INITIAL_INVESTMENT_A,
                            assetB: INITIAL_INVESTMENT_B              // It starts with the initial investment.
                        },
                        profits: {
                            assetA: 0,
                            assetB: 0
                        },
                        combinedProfits: {
                            assetA: 0,
                            assetB: 0
                        },
                        positions: [],
                        transactions: []
                    };

                    callBack(global.DEFAULT_OK_RESPONSE);

                } catch (err) {
                    logger.write(MODULE_NAME, "[ERROR] initialize -> createConext -> err = " + err.message);
                    callBack(global.DEFAULT_FAIL_RESPONSE);
                }
            }

        } catch (err) {
            logger.write(MODULE_NAME, "[ERROR] initialize -> err = " + err.message);
            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
        }
    }

    function saveThemAll(callBackFunction) {

        try {

            if (global.LOG_CONTROL[MODULE_NAME].logInfo === true) { logger.write(MODULE_NAME, "[INFO] saveThemAll -> Entering function."); }

            writeExecutionContext(onDone);

            function onDone(err) {
                try {

                    switch (err.result) {
                        case global.DEFAULT_OK_RESPONSE.result: {
                            if (global.LOG_CONTROL[MODULE_NAME].logInfo === true) { logger.write(MODULE_NAME, "[INFO] saveThemAll -> onDone -> Execution finished well."); }

                            bot.hasTheBotJustStarted = false;

                            callBackFunction(global.DEFAULT_OK_RESPONSE);
                            return;
                        }
                            break;
                        case global.DEFAULT_RETRY_RESPONSE.result: {  // Something bad happened, but if we retry in a while it might go through the next time.
                            logger.write(MODULE_NAME, "[ERROR] saveThemAll -> onDone -> Retry Later. Requesting Execution Retry.");
                            callBackFunction(err);
                            return;
                        }
                            break;
                        case global.DEFAULT_FAIL_RESPONSE.result: { // This is an unexpected exception that we do not know how to handle.
                            logger.write(MODULE_NAME, "[ERROR] saveThemAll -> onDone -> Operation Failed. Aborting the process.");
                            callBackFunction(err);
                            return;
                        }
                            break;
                    }

                } catch (err) {
                    logger.write(MODULE_NAME, "[ERROR] saveThemAll -> onDone -> err = " + err.message);
                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                }
            }

            function writeExecutionContext(callBack) {

                try {

                    if (global.LOG_CONTROL[MODULE_NAME].logInfo === true) { logger.write(MODULE_NAME, "[INFO] saveThemAll -> writeExecutionContext -> Entering function."); }

                    let fileName = "Execution.Context." + bot.startMode + "." + runIndex +".json";
                    let dateForPath = bot.processDatetime.getUTCFullYear() + '/' + utilities.pad(bot.processDatetime.getUTCMonth() + 1, 2) + '/' + utilities.pad(bot.processDatetime.getUTCDate(), 2) + '/' + utilities.pad(bot.processDatetime.getUTCHours(), 2) + '/' + utilities.pad(bot.processDatetime.getUTCMinutes(), 2);
                    let filePath = bot.filePathRoot + "/Output/" + bot.process + '/' + dateForPath;

                    if (global.LOG_CONTROL[MODULE_NAME].logInfo === true) { logger.write(MODULE_NAME, "[INFO] saveThemAll -> writeExecutionContext -> fileName = " + fileName); }
                    if (global.LOG_CONTROL[MODULE_NAME].logInfo === true) { logger.write(MODULE_NAME, "[INFO] saveThemAll -> writeExecutionContext -> filePath = " + filePath); }

                    let fileContent = JSON.stringify(thisObject.executionContext);

                    cloudStorage.createTextFile(filePath, fileName, fileContent + '\n', onFileCreated);

                    function onFileCreated(err) {

                        if (global.LOG_CONTROL[MODULE_NAME].logInfo === true) { logger.write(MODULE_NAME, "[INFO] saveThemAll -> writeExecutionContext -> onFileCreated -> Entering function."); }

                        if (err.result !== global.DEFAULT_OK_RESPONSE.result) {
                            logger.write(MODULE_NAME, "[ERROR] saveThemAll -> writeExecutionContext -> onFileCreated -> err = " + err.message);
                            callBack(err);
                            return;
                        }

                        if (global.LOG_CONTROL[MODULE_NAME].logContent === true) {
                            logger.write(MODULE_NAME, "[INFO] saveThemAll -> writeExecutionContext -> onFileCreated ->  Content written = " + fileContent);
                        }

                        writeExucutionHistory(callBack);
                        return;
                    }

                }
                catch (err) {
                    logger.write(MODULE_NAME, "[ERROR] saveThemAll -> writeExecutionContext -> err = " + err.message);
                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                }
            }

            function writeExucutionHistory(callBack) {

                try {

                    if (global.LOG_CONTROL[MODULE_NAME].logInfo === true) { logger.write(MODULE_NAME, "[INFO] saveThemAll -> writeExucutionHistory -> Entering function."); }

                    let fileName = "Execution.History." + bot.startMode + "." + runIndex + ".json";
                    let filePath = bot.filePathRoot + "/Output/" + bot.process;

                    if (global.LOG_CONTROL[MODULE_NAME].logInfo === true) { logger.write(MODULE_NAME, "[INFO] saveThemAll -> writeExucutionHistory -> fileName = " + fileName); }
                    if (global.LOG_CONTROL[MODULE_NAME].logInfo === true) { logger.write(MODULE_NAME, "[INFO] saveThemAll -> writeExucutionHistory -> filePath = " + filePath); }

                    let newRecord = [
                        thisObject.newHistoryRecord.date.valueOf(),
                        thisObject.newHistoryRecord.buyAvgRate,
                        thisObject.newHistoryRecord.sellAvgRate,

                        thisObject.newHistoryRecord.lastSellRate,
                        thisObject.newHistoryRecord.sellExecRate,
                        thisObject.newHistoryRecord.lastBuyRate,
                        thisObject.newHistoryRecord.buyExecRate,

                        thisObject.newHistoryRecord.marketRate,
                        thisObject.newHistoryRecord.newPositions,
                        thisObject.newHistoryRecord.newTrades,
                        thisObject.newHistoryRecord.movedPositions,
                        thisObject.newHistoryRecord.profitsAssetA,
                        thisObject.newHistoryRecord.profitsAssetB,
                        thisObject.newHistoryRecord.combinedProfitsA,
                        thisObject.newHistoryRecord.combinedProfitsB,

                        thisObject.newHistoryRecord.messageRelevance,
                        thisObject.newHistoryRecord.messageTitle,
                        thisObject.newHistoryRecord.messageBody
                    ];

                    let recordWithExtraData = newRecord.concat(thisObject.extraData);

                    thisObject.executionHistory.push(recordWithExtraData);

                    let fileContent = JSON.stringify(thisObject.executionHistory);

                    cloudStorage.createTextFile(filePath, fileName, fileContent + '\n', onFileCreated);

                    function onFileCreated(err) {

                        if (global.LOG_CONTROL[MODULE_NAME].logInfo === true) { logger.write(MODULE_NAME, "[INFO] saveThemAll -> writeExucutionHistory -> onFileCreated -> Entering function."); }

                        if (err.result !== global.DEFAULT_OK_RESPONSE.result) {
                            logger.write(MODULE_NAME, "[ERROR] saveThemAll -> writeExucutionHistory -> onFileCreated -> err = " + err.message);
                            callBack(err);
                            return;
                        }

                        if (global.LOG_CONTROL[MODULE_NAME].logContent === true) {
                            logger.write(MODULE_NAME, "[INFO] saveThemAll -> writeExucutionHistory -> onFileCreated ->  Content written = " + fileContent);
                        }

                        /* Here we will write the file containing the max sequence number. */

                        fileContent = runIndex;
                        fileName = "Execution.History." + bot.startMode + "." + "Sequence" + ".json";
                        filePath = bot.filePathRoot + "/Output/" + bot.process;

                        cloudStorage.createTextFile(filePath, fileName, fileContent + '\n', onSequenceFileCreated);

                        function onSequenceFileCreated(err) {

                            if (global.LOG_CONTROL[MODULE_NAME].logInfo === true) { logger.write(MODULE_NAME, "[INFO] saveThemAll -> writeExucutionHistory -> onFileCreated -> onSequenceFileCreated -> Entering function."); }

                            if (err.result !== global.DEFAULT_OK_RESPONSE.result) {
                                logger.write(MODULE_NAME, "[ERROR] saveThemAll -> writeExucutionHistory -> onFileCreated -> onSequenceFileCreated -> err = " + err.message);
                                callBack(err);
                                return;
                            }

                            writeStatusReport(callBack);
                            return;
                        }
                    }

                }
                catch (err) {
                    logger.write(MODULE_NAME, "[ERROR] saveThemAll -> writeExucutionHistory -> err = " + err.message);
                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                }
            }

            function writeStatusReport(callBack) {

                try {

                    if (global.LOG_CONTROL[MODULE_NAME].logInfo === true) { logger.write(MODULE_NAME, "[INFO] saveThemAll -> writeStatusReport -> Entering function."); }

                    statusReportModule.file = thisObject.statusReport;
                    statusReportModule.save(callBack);

                }
                catch (err) {
                    logger.write(MODULE_NAME, "[ERROR] saveThemAll -> writeStatusReport -> err = " + err.message);
                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                }
            }

        } catch (err) {
            logger.write(MODULE_NAME, "[ERROR] saveThemAll -> Error = " + err.message);
            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
        }
    }

    function truncDecimals(pFloatValue, pDecimals) {

        if (!pDecimals) pDecimals = 8; // Default value

        return parseFloat(parseFloat(pFloatValue).toFixed(pDecimals));

    }

};