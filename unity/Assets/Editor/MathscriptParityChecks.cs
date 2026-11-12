using System;
using UnityEngine;
using MathscriptPrototype;

public static class MathscriptParityChecks
{
    public static void Run()
    {
        CheckReferenceFirstUpgrade();
        CheckCommissioning();
        CheckReferenceConstruction();
        CheckProgression();
        foreach (int level in new[] { 1, 9, 10, 24, 25, 49, 50, 100 })
        {
            int expected = level >= 50 ? 4 : level >= 25 ? 3 : level >= 10 ? 2 : 1;
            Require(MathscriptTycoonUI.WorkerCount(level) == expected, "Presentation crew threshold matches web");
        }
        var floors = new MathscriptEconomy();
        floors.Tick(1);
        Require(floors.bins[0] == 0 && floors.Coins == 1000, "Unhired floor stays idle");
        Require(floors.Generate(0) && floors.bins[0] == 7.5 && floors.Coins == 1000, "Manual generation gives RC, not coins");
        Require(floors.HireFloor(0) && floors.Coins == 952 && !floors.HireFloor(0), "Hiring costs once");
        for (int step = 0; step < 10; step++) floors.Tick(0.1);
        Require(floors.bins[0] == 8, "Hired starting floor produces 0.5 RC each second");
        floors.levels[0] = 10;
        Require(floors.FloorRate(0) == 10, "Level ten milestone rate matches source");
        floors.levels[0] = 25;
        Require(floors.FloorRate(0) == 37.5, "Level twenty-five rate matches source");
        floors.coins = 1000;
        Require(!floors.UpgradeFloor(2) && floors.UpgradeFloor(1), "Unlocks are sequential");
        var economy = new MathscriptEconomy();
        economy.coins = 0;
        Require(!economy.SendBus() && !economy.Compile(), "Empty pipeline cannot run");
        economy.AddProduction(35);
        Require(economy.SendBus() && !economy.SendBus(), "Busy bus rejects repeated dispatch");
        economy.Tick(2.5);
        Require(economy.BusPayload == 30 && economy.FloorBin == 5, "Loading consumes bins up to capacity");
        Require(economy.CompilerBuffer == 0, "Payload cannot arrive before return/unload");
        economy.Tick(1.4);
        Require(economy.BusState == "IDLE" && economy.CompilerBuffer == 30, "Bus drops payload after 3.9 seconds");
        Require(economy.Compile() && !economy.Compile(), "Busy compiler rejects repeated requests");
        economy.Tick(0.6);
        Require(economy.ProcessingBatch == 3 && economy.CompilerBuffer == 27 && economy.Coins == 0, "Fetch reserves batch without paying");
        economy.Tick(2);
        Require(economy.Coins == 6.1 && economy.CompiledRC == 3, "Conversion includes source flow reward without math gate");
        economy.Tick(100);
        Require(economy.Coins == 6.1, "Completed batch cannot pay repeatedly");
        Require(economy.FloorBin + economy.BusPayload + economy.CompilerBuffer + economy.ProcessingBatch + economy.CompiledRC == 35, "RC is conserved");
        var partial = new MathscriptEconomy();
        partial.coins = 0;
        partial.AddProduction(1.25);
        partial.SendBus();
        partial.Tick(3.9);
        partial.Compile();
        partial.Tick(2.6);
        Require(partial.Coins == 2.5 && partial.CompilerBuffer == 0, "Partial batches are supported by core handler");
        var upgrades = new MathscriptEconomy { coins = 1000000000 };
        for (int track = 0; track < 6; track++)
        {
            double previous = upgrades.coins;
            Require(upgrades.UpgradeTrack(track) && upgrades.coins == previous - MathscriptEconomy.TrackBases[track], "Each track charges its initial price");
            Require(upgrades.TrackCost(track) == Math.Ceiling(MathscriptEconomy.TrackBases[track] * (track == 2 ? 1.3 : 1.15)), "Next track price matches source");
        }
        foreach (int track in new[] { 1, 2, 4 })
        {
            while (!upgrades.TrackCapped(track)) Require(upgrades.UpgradeTrack(track), "Cap is reachable");
            double previous = upgrades.coins;
            Require(!upgrades.UpgradeTrack(track) && upgrades.coins == previous, "Capped track cannot charge");
        }
        Require(upgrades.BusSpeed == 2.5 && upgrades.LoadingSeconds == 0.3 && upgrades.ProcessingSeconds == 0.5, "Track caps match source");
        var bulk = new MathscriptEconomy { coins = 100000 };
        double sum = 11;
        for (int level = 2; level < 11; level++) sum += Math.Ceiling(8 * Math.Pow(1.15, level));
        Require(bulk.UpgradeFloor(0, 10) && bulk.coins == 100000 - sum, "Bulk prices sum individually rounded costs");
        Require(bulk.PendingChallenge == 0 && !bulk.AnswerChallenge(0), "Wrong answer retains bonus");
        double bonusStart = bulk.coins;
        Require(bulk.AnswerChallenge(1) && bulk.coins == bonusStart + 50 && bulk.PendingChallenge == 1, "Correct bonus pays once");
        bulk.SkipChallenge();
        Require(bulk.PendingChallenge == 2 && bulk.AnswerChallenge(2) && bulk.PendingChallenge == -1 && !bulk.AnswerChallenge(2), "Skip and completed bonuses cannot replay");
        var offscreen = new MathscriptEconomy();
        offscreen.levels[1] = 1;
        offscreen.levels[2] = 1;
        offscreen.bins[2] = 10;
        Require(offscreen.SendBus() && offscreen.BusPayload == 0 && offscreen.targetSlot == 2, "Offscreen resources require physical elevator travel");
        offscreen.Tick(0.4);
        Require(offscreen.CompilerBuffer == 0 && offscreen.bins[2] == 10, "Offscreen stock cannot teleport to the warehouse");
        offscreen.Tick(7.5);
        Require(offscreen.CompilerBuffer == 10 && offscreen.BusState == "IDLE", "Third shaft completes travel, loading, return and unloading");
        var visible = new MathscriptEconomy();
        visible.levels[1] = 1;
        visible.bins[0] = 10;
        visible.bins[1] = 10;
        visible.SendBus();
        Require(visible.targetSlot == 1, "Two-floor route visits highest first");
        visible.Tick(7.4);
        Require(visible.CompilerBuffer == 20 && visible.BusState == "IDLE", "Two-floor route timing matches source");
        foreach (int viewport in new[] { 0, 2, 5 })
        {
            var cameraIndependent = new MathscriptEconomy { viewport = viewport };
            cameraIndependent.levels[1] = 1;
            cameraIndependent.bins[0] = 10;
            cameraIndependent.bins[1] = 10;
            Require(cameraIndependent.SendBus() && cameraIndependent.targetSlot == 1, "Camera does not select transport stops");
            cameraIndependent.viewport = (viewport + 3) % 6;
            cameraIndependent.Tick(7.4);
            Require(cameraIndependent.CompilerBuffer == 20 && cameraIndependent.FloorBin == 0 && cameraIndependent.BusState == "IDLE", "Scrolling during a trip preserves timing and stock");
            Require(cameraIndependent.FlowMultiplier() == visible.FlowMultiplier(), "Camera does not change income multiplier");
        }
        var automated = new MathscriptEconomy { coins = 10000 };
        automated.Generate(0);
        Require(automated.HireSector(true) && !automated.HireSector(true), "Bus manager charges once");
        automated.Tick(10);
        Require(automated.CompilerBuffer == 7.5 && automated.CompiledRC == 0, "Bus manager cannot automate compiler");
        Require(automated.HireSector(false), "Independent compiler manager can be hired");
        automated.Tick(10);
        Require(automated.CompiledRC == 7.5, "Compiler manager drains delivered stock");
        var onlyCompiler = new MathscriptEconomy { compilerManager = true };
        onlyCompiler.Generate(0);
        onlyCompiler.Tick(10);
        Require(onlyCompiler.FloorBin == 7.5 && onlyCompiler.CompiledRC == 0, "Compiler manager cannot automate bus");
        var offline = new MathscriptEconomy { busManager = true, compilerManager = true, savedAt = 1000000 };
        offline.hired[0] = true;
        var minuteOnline = JsonUtility.FromJson<MathscriptEconomy>(JsonUtility.ToJson(offline));
        minuteOnline.Tick(60);
        double minuteReward = MathscriptEconomy.Round(minuteOnline.coins - offline.coins);
        Require(offline.ClaimOffline(1060000) == minuteReward && offline.ClaimOffline(1060000) == 0, "Offline minute pays the live pipeline once");
        offline.savedAt = 1000000;
        var cappedOnline = JsonUtility.FromJson<MathscriptEconomy>(JsonUtility.ToJson(offline));
        cappedOnline.Tick(28800);
        double cappedReward = MathscriptEconomy.Round(cappedOnline.coins - offline.coins);
        Require(offline.ClaimOffline(1000000 + 86400000) == cappedReward, "Offline income caps at eight hours of actual pipeline progress");
        var transit = new MathscriptEconomy();
        transit.AddProduction(35);
        transit.SendBus();
        transit.Tick(2.6);
        string path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "mathscript-parity-" + Guid.NewGuid() + ".json");
        try
        {
            MathscriptSave.Write(path, transit, 1000000);
            var reloaded = MathscriptSave.Read(path, 1000000, out double reward);
            Require(reward == 0 && reloaded.BusPayload == 30, "Disk save preserves transit payload");
            reloaded.Tick(1.3);
            reloaded.Compile();
            reloaded.Tick(0.7);
            MathscriptSave.Write(path, reloaded, 1000000);
            reloaded = MathscriptSave.Read(path, 1000000, out reward);
            Require(reloaded.ProcessingBatch == 3, "Disk save preserves reserved compiler batch");
            reloaded.Tick(1.9);
            Require(reloaded.CompiledRC == 3 && reloaded.FloorBin + reloaded.CompilerBuffer + reloaded.CompiledRC == 35, "Restart preserves RC and one-time payout");
            var returnFixture = new MathscriptEconomy { busManager = true, compilerManager = true };
            returnFixture.hired[0] = true;
            MathscriptSave.Write(path, returnFixture, 1000000);
            var claimed = MathscriptSave.Read(path, 1060000, out reward, out MathscriptOfflineProgress report);
            Require(reward == minuteReward && report.earnings == reward && report.seconds == 60 && report.producedRC == 30,
                "Offline reward and conserved production summary are written to disk");
            Require(report.compiledRC == claimed.compiledRC && !report.capped, "Return summary reports actual compiled work");
            double paidCoins = claimed.coins;
            claimed = MathscriptSave.Read(path, 1060000, out reward);
            Require(reward == 0 && claimed.coins == paidCoins, "Offline claim cannot replay after restart");
            var deep = new MathscriptEconomy();
            for (int floor = 1; floor < 7; floor++) deep.levels[floor] = 1;
            deep.bins[6] = 20;
            deep.SendBus();
            deep.Tick(3);
            MathscriptSave.Write(path, deep, 1000000);
            deep = MathscriptSave.Read(path, 1000000, out reward);
            Require(deep.targetSlot == 6 && deep.bins[6] == 20, "Deep elevator trip survives disk reload");
            deep.Tick(13);
            Require(deep.CompilerBuffer == 20 && deep.FloorBin == 0 && deep.busState == "IDLE", "Deep trip resumes without lost or duplicated stock");
            var oldTrip = new MathscriptEconomy { version = 2, routeViewport = 2, viewport = 2 };
            for (int floor = 1; floor < 4; floor++) oldTrip.levels[floor] = 1;
            oldTrip.bins[3] = 12;
            oldTrip.busState = "MOVING_UP";
            oldTrip.route = new[] { 3 };
            oldTrip.targetSlot = 1;
            oldTrip.tripCapacity = 30;
            oldTrip.tripMove = 1;
            oldTrip.tripLoad = 1.5;
            oldTrip.moveDuration = oldTrip.busRemaining = 2;
            oldTrip.savedAt = 1000000;
            System.IO.File.WriteAllText(path, JsonUtility.ToJson(oldTrip));
            var migrated = MathscriptSave.Read(path, 1000000, out reward);
            Require(migrated.version == 3 && migrated.targetSlot == 3 && migrated.bins[3] == 12, "Legacy viewport-relative trip migrates without resetting player stock");
        }
        finally { if (System.IO.File.Exists(path)) System.IO.File.Delete(path); if (System.IO.File.Exists(path + ".tmp")) System.IO.File.Delete(path + ".tmp"); }
        Debug.Log("MATHSCRIPT_PARITY_PIPELINE_PASS");
    }

    private static void CheckCommissioning()
    {
        string path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "mathscript-commissioning-" + Guid.NewGuid() + ".json");
        try
        {
            var fresh = MathscriptSave.Read(path, 1000000, out double offline);
            Require(fresh.coins == 10 && fresh.TotalLevels == 0 && offline == 0 && MathscriptSave.Valid(fresh),
                "Fresh companies start with ten coins and an uncommissioned first department");
            fresh.Tick(5);
            Require(fresh.coins == 10 && !fresh.Generate(0) && !fresh.HireFloor(0) && !fresh.UpgradeFloor(1)
                && fresh.FloorBin == 0, "Unbuilt departments cannot produce, automate or be bypassed");
            Require(fresh.SuggestedInvestment.kind == MathscriptInvestmentKind.UpgradeFloor && fresh.SuggestedInvestment.index == 0
                && fresh.SuggestedInvestment.action == "BUILD" && fresh.SuggestedInvestment.cost == 10
                && fresh.OperationsGoal.title == "Commission department 1", "Opening guidance points at the first construction purchase");
            MathscriptSave.Write(path, fresh, 1000000);
            fresh = MathscriptSave.Read(path, 1000000, out offline);
            Require(fresh.coins == 10 && fresh.TotalLevels == 0 && fresh.Invest() && fresh.coins == 0 && fresh.levels[0] == 1,
                "Construction survives reload and charges exactly ten coins");
            Require(!fresh.Invest() && fresh.coins == 0 && fresh.levels[0] == 1 && fresh.Generate(0),
                "Construction cannot replay and commissioned production remains available");
            var existing = new MathscriptEconomy { coins = 4321 };
            MathscriptSave.Write(path, existing, 1000000);
            existing = MathscriptSave.Read(path, 1000000, out offline);
            Require(existing.coins == 4321 && existing.levels[0] == 1 && offline == 0,
                "Existing companies retain their balance and built departments");
            var poor = MathscriptEconomy.CreateCompany();
            poor.coins = 9;
            Require(!poor.Invest() && poor.coins == 9 && poor.TotalLevels == 0, "Unaffordable construction is inert");
            var bulk = MathscriptEconomy.CreateCompany();
            bulk.coins = 1000;
            Require(bulk.UpgradeFloor(0, 2) && bulk.coins == 979 && bulk.levels[0] == 2,
                "Bulk construction includes the observed opening and first-upgrade prices");
        }
        finally { if (System.IO.File.Exists(path)) System.IO.File.Delete(path); if (System.IO.File.Exists(path + ".tmp")) System.IO.File.Delete(path + ".tmp"); }
        Debug.Log("MATHSCRIPT_COMMISSIONING_PASS");
    }

    public static void CheckReferenceConstruction()
    {
        var state = new MathscriptEconomy { coins = 999 };
        Require(state.FloorCost(1) == 1000, "Second department matches the playable reference's 1K construction price");
        Require(!state.UpgradeFloor(1) && state.coins == 999 && state.levels[1] == 0,
            "Unaffordable second construction leaves cash and departments unchanged");
        state.coins = 1000;
        Require(state.UpgradeFloor(1) && state.coins == 0 && state.levels[1] == 1,
            "Second construction charges exactly 1000 once");
        Require(state.FloorCost(1) == 58 && !state.UpgradeFloor(1) && state.levels[1] == 1,
            "Built departments retain their existing upgrade curve");
        var bulk = new MathscriptEconomy { coins = 1057 };
        Require(!bulk.UpgradeFloor(1, 2) && bulk.coins == 1057 && bulk.levels[1] == 0,
            "Bulk construction is atomic when the combined price is unaffordable");
        bulk.coins = 1058;
        Require(bulk.UpgradeFloor(1, 2) && bulk.coins == 0 && bulk.levels[1] == 2,
            "Bulk construction includes the reference construction price and existing upgrade price");
        Debug.Log("MATHSCRIPT_REFERENCE_CONSTRUCTION_PASS");
    }

    public static void CheckReferenceFirstUpgrade()
    {
        var state = new MathscriptEconomy { coins = 10 };
        Require(state.FloorCost(0) == 11, "First department's level-one upgrade matches the observed reference price of 11");
        var fifty = new MathscriptEconomy { coins = 66431 };
        Require(!fifty.UpgradeFloor(0, 50) && fifty.coins == 66431 && fifty.levels[0] == 1,
            "x50 rejects one coin short of its complete reference-adjusted price");
        fifty.coins = 66432;
        Require(fifty.UpgradeFloor(0, 50) && fifty.coins == 0 && fifty.levels[0] == 51,
            "x50 includes the observed first upgrade and all retained later prices");
        Require(!state.UpgradeFloor(0) && state.coins == 10 && state.levels[0] == 1,
            "One coin short cannot purchase or mutate the first upgrade");
        state.coins = 11;
        Require(state.UpgradeFloor(0) && state.coins == 0 && state.levels[0] == 2,
            "Exact-funded first upgrade charges 11 once");
        Require(!state.UpgradeFloor(0) && state.coins == 0 && state.levels[0] == 2
            && state.FloorCost(0) == Math.Ceiling(8 * Math.Pow(1.15, 2)),
            "No purchase replay or extrapolated change to the later upgrade curve");
        var bulk = MathscriptEconomy.CreateCompany();
        bulk.coins = 20;
        Require(!bulk.UpgradeFloor(0, 2) && bulk.coins == 20 && bulk.levels[0] == 0,
            "Combined construction and first upgrade reject incomplete funding atomically");
        bulk.coins = 21;
        Require(bulk.UpgradeFloor(0, 2) && bulk.coins == 0 && bulk.levels[0] == 2,
            "Combined purchase includes ten-coin construction and eleven-coin first upgrade");
        Debug.Log("MATHSCRIPT_REFERENCE_FIRST_UPGRADE_PASS");
    }

    private static void CheckProgression()
    {
        var state = new MathscriptEconomy { coins = 100000, lifetime = 40000 };
        Require(!state.BuyResearch(1), "Research prerequisite enforced");
        Require(state.BuyResearch(0) && state.coins == 97500 && !state.BuyResearch(0), "Research spends once");
        Require(state.FloorRate(0) == 0.625, "Research affects production");
        Require(!state.ActivateSkill(0), "Unhired manager cannot use skill");
        state.hired[0] = true;
        Require(state.ActivateSkill(0) && !state.ActivateSkill(0) && state.FloorRate(0) == 1.25, "Frenzy doubles production once");
        state.Tick(30);
        Require(!state.SkillActive(0) && !state.ActivateSkill(0) && state.FloorRate(0) == 0.625, "Effect expires before cooldown");
        state.Tick(120);
        Require(state.ActivateSkill(0), "Cooldown becomes ready after 150 seconds");
        state.busManager = state.compilerManager = true;
        Require(state.ActivateSkill(7) && state.BusSpeed == 1.5 && state.LoadingSeconds == 0.5 && state.ActivateSkill(8) && state.BatchSize == 15, "Sector skill effects match web");
        state.bins[0] = 35;
        state.SendBus();
        Require(state.PrimeRefactor() && state.claimedTokens == 2 && state.refactors == 1 && state.coins == 1000, "Refactor claims square-root lifetime tokens");
        Require(state.FloorBin + state.BusPayload + state.CompilerBuffer + state.ProcessingBatch == 0 && state.busState == "IDLE", "Refactor clears in-flight resources");
        Require(!state.PrimeRefactor() && state.lifetime == 40000 && state.research[0] && state.FloorRate(0) == 0.75, "Refactor cannot replay; research and lifetime survive");
        Require(!state.AnswerQuest(2, 0) && state.AnswerQuest(2, 1) && !state.AnswerQuest(2, 1), "Quest wrong answer rejected and reward unique");
        Require(MathscriptEconomy.QuestNames.Length == 3 && MathscriptEconomy.QuestQuestions.Length == 3
            && MathscriptEconomy.QuestHints.Length == 3 && MathscriptEconomy.QuestExplanations.Length == 3,
            "All data-center learning examples have a question, hint and worked explanation");
        for (int quest = 0; quest < 3; quest++)
        {
            var lesson = new MathscriptEconomy();
            double before = lesson.coins;
            int answer = MathscriptEconomy.QuestAnswers[quest];
            Require(!lesson.AnswerQuest(quest, answer) && lesson.coins == before && !lesson.questsDone[quest],
                "Unavailable learning examples cannot award coins");
            lesson.compiledRC = 3;
            lesson.busManager = lesson.compilerManager = true;
            lesson.refactors = 1;
            Require(lesson.QuestAvailable(quest) && !lesson.AnswerQuest(quest, (answer + 1) % 3)
                && lesson.coins == before && !lesson.questsDone[quest], "Incorrect answers preserve the lesson and balance");
            Require(lesson.AnswerQuest(quest, answer) && lesson.coins == before + MathscriptEconomy.QuestRewards[quest]
                && lesson.questsDone[quest], "Correct answers award the existing learning reward");
            Require(!lesson.AnswerQuest(quest, answer) && lesson.coins == before + MathscriptEconomy.QuestRewards[quest],
                "Completed learning examples cannot replay their reward");
        }
        var poor = new MathscriptEconomy { coins = 2499 };
        Require(!poor.BuyResearch(0) && poor.coins == 2499 && !poor.PrimeRefactor(), "Insufficient spending and ineligible prestige are inert");
        string path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "mathscript-progression-" + Guid.NewGuid() + ".json");
        try
        {
            state.hired[0] = true;
            state.ActivateSkill(0);
            MathscriptSave.Write(path, state, 1000000);
            var restored = MathscriptSave.Read(path, 1031000, out double offline);
            Require(!restored.SkillActive(0) && restored.CooldownSeconds(0) == 119 && offline == 0, "Restart expires active effect without resetting cooldown");
            Require(restored.research[0] && restored.questsDone[2] && !restored.PrimeRefactor(), "Progression round-trip preserves reward identity");
            var legacy = new MathscriptEconomy { version = 1 };
            System.IO.File.WriteAllText(path, JsonUtility.ToJson(legacy));
            restored = MathscriptSave.Read(path, 1000000, out offline);
            Require(restored.version == 3 && restored.coins == 1000 && restored.levels[0] == 1, "Legacy save migration retains economy");
        }
        finally { if (System.IO.File.Exists(path)) System.IO.File.Delete(path); }
        Debug.Log("MATHSCRIPT_PROGRESSION_PASS");
    }

    private static void Require(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }
}