using System;
using MathscriptPrototype;
using UnityEngine;

public static class MathscriptIdleLoopChecks
{
    private const long SavedAt = 1000000;

    public static void Audit()
    {
        foreach (bool deep in new[] { false, true })
        {
            var live = Fixture(deep);
            var returned = Clone(live);
            double before = live.coins;
            live.Tick(3600);
            double claimed = returned.ClaimOffline(SavedAt + 3600000);
            Debug.Log("MATHSCRIPT_IDLE_AUDIT profile=deterministic-idle depth=" + (deep ? 7 : 1)
                + " duration=3600 onlineCoins=" + MathscriptEconomy.Round(live.coins - before)
                + " offlineCoins=" + claimed + " onlineCompiled=" + live.compiledRC
                + " offlineCompiled=" + returned.compiledRC);
        }
    }

    public static void Run()
    {
        Audit();
        CheckInvestments();
        CheckUpgradePreview();
        CheckFractionalSkillExpiry();
        CheckLiftSharing();
        foreach (bool deep in new[] { false, true })
            foreach (int elapsed in new[] { 60, 3600, 86400 })
                CheckReturn(deep, elapsed);

        var partial = Fixture(false);
        partial.busManager = partial.compilerManager = false;
        var expected = Clone(partial);
        expected.Tick(60);
        Require(partial.ClaimOffline(SavedAt + 60000) == 0, "Production alone cannot create offline coins");
        Require(partial.bins[0] == expected.bins[0], "Hired floors retain offline output without sector managers");
        Require(partial.ClaimOffline(SavedAt + 60000) == 0 && partial.bins[0] == expected.bins[0], "Returning inventory cannot replay");

        var transit = Fixture(false);
        transit.busManager = transit.compilerManager = false;
        transit.AddProduction(35);
        transit.SendBus();
        transit.Tick(2.6);
        expected = Clone(transit);
        expected.Tick(60);
        transit.ClaimOffline(SavedAt + 60000);
        SamePipeline(transit, expected);

        var activeSkill = Fixture(false);
        activeSkill.ActivateSkill(0);
        expected = Clone(activeSkill);
        expected.Tick(60);
        activeSkill.ClaimOffline(SavedAt + 60000);
        SamePipeline(activeSkill, expected);
        Require(!activeSkill.SkillActive(0) && activeSkill.CooldownSeconds(0) == 90,
            "An active skill contributes only its remaining duration and its cooldown advances once");

        var shortReturn = Fixture(false);
        double shortStart = shortReturn.coins;
        expected = Clone(shortReturn);
        expected.Tick(59);
        double shortEarnings = shortReturn.ClaimOffline(SavedAt + 59000);
        Require(shortEarnings > 0 && shortEarnings == MathscriptEconomy.Round(expected.coins - shortStart),
            "A short absence earns the same income as running the automated facility");
        SamePipeline(shortReturn, expected);
        Require(MathscriptSave.Valid(new MathscriptEconomy { viewport = 6 }), "The last shaft remains saveable in a single-floor landscape view");
        Debug.Log("MATHSCRIPT_IDLE_LOOP_PASS offline/live-parity/partial-automation/transit/no-replay/eight-hour-cap");
    }

    private static void CheckFractionalSkillExpiry()
    {
        var state = Fixture(true);
        for (int frame = 0; frame < 81; frame++) state.Tick(0.016666667);
        for (int manager = 0; manager < state.skillUntil.Length; manager++)
            Require(state.ActivateSkill(manager), "Staffed managers can activate at a fractional clock time");
        state.Tick(29.99);
        var legacy = Clone(state);
        // Older saves stored the result of adding the duration without rounding.
        legacy.skillUntil[0] = 1350.000027 + 30000;
        Require(MathscriptSave.Valid(legacy), "An unrounded active deadline is valid in an existing save");
        foreach (var company in new[] { state, legacy })
        {
            double before = company.clockMs;
            for (int manager = 0; manager < company.skillUntil.Length; manager++)
                Require(company.SkillActive(manager), "Boosts remain active before the deadline");
            company.Tick(0.02);
            Require(Math.Abs(company.clockMs - before - 20) < 0.000001, "Tick completes across boost expiration");
            for (int manager = 0; manager < company.skillUntil.Length; manager++)
                Require(!company.SkillActive(manager) && !company.ActivateSkill(manager),
                    "Expired boosts stop and retain their cooldown");
        }
        Debug.Log("MATHSCRIPT_FRACTIONAL_SKILL_EXPIRY_PASS");
    }

    private static void CheckUpgradePreview()
    {
        var company = Fixture(false);
        company.coins = 1000000;
        string before = JsonUtility.ToJson(company);
        var floor = company.PreviewUpgrade(MathscriptInvestmentKind.UpgradeFloor, 0, 10);
        Require(floor.limit == "Compiler limits throughput" && floor.income > company.EstimatedIncome, "Bulk output can shift the bottleneck");
        Require(JsonUtility.ToJson(company) == before, "Preview leaves cash, inventory, progression, and save fields untouched");
        Require(company.UpgradeFloor(0, 10) && Math.Abs(company.EstimatedIncome - floor.income) < 0.000001,
            "Bulk floor projection uses the purchased milestone rate");
        for (int track = 0; track < company.tracks.Length; track++)
        {
            var upgrade = company.PreviewUpgrade(MathscriptInvestmentKind.UpgradeTrack, track);
            Require(company.UpgradeTrack(track) && Math.Abs(company.EstimatedIncome - upgrade.income) < 0.000001,
                "Track " + track + " preview matches the purchased pipeline rate");
        }
        company.compilerManager = false;
        Require(company.PreviewUpgrade(MathscriptInvestmentKind.UpgradeTrack, 3).income == 0,
            "A manually operated step cannot promise idle income");
        Debug.Log("MATHSCRIPT_UPGRADE_PREVIEW_PASS");
    }

    private static void CheckLiftSharing()
    {
        var manual = new MathscriptEconomy();
        manual.levels[1] = 50;
        manual.bins[0] = 1.25;
        manual.bins[1] = 100;
        Require(manual.SendBus() && manual.targetSlot == 1, "A manual route starts at the deepest stocked floor");
        manual.Tick(3.5);
        Require(manual.busPayload == 28.75 && manual.targetSlot == 0,
            "The deepest floor leaves room for the lightly stocked floor and uses the spare capacity");
        var resumed = Clone(manual);
        Require(MathscriptSave.Valid(resumed), "The reserved route remains saveable mid-trip");
        resumed.Tick(4);
        Require(resumed.compilerBuffer == 30 && resumed.bins[0] == 0 && resumed.bins[1] == 71.25,
            "Resuming the trip delivers both floors' cargo without losing or duplicating RC");

        var automated = Fixture(false);
        automated.compilerManager = false;
        automated.levels[1] = 50;
        automated.hired[1] = true;
        automated.Tick(120);
        Require(automated.bins[0] < 10 && automated.compilerBuffer > 0,
            "Automatic trips repeatedly collect the upper floor despite a saturated deeper floor");
        double produced = (automated.FloorRate(0) + automated.FloorRate(1)) * 120;
        Require(MathscriptEconomy.Round(automated.FloorBin + automated.busPayload + automated.compilerBuffer) == produced,
            "Automatic collection conserves cargo under sustained load");
        Debug.Log("MATHSCRIPT_LIFT_SHARING_PASS");
    }

    private static void CheckInvestments()
    {
        var state = new MathscriptEconomy();
        Require(state.SuggestedInvestment.kind == MathscriptInvestmentKind.HireFloor && state.SuggestedInvestment.cost == 48,
            "Fresh towers recommend productive automation before floor spending");
        Require(state.OperationsGoal.current == 0 && state.OperationsGoal.target == 3 && state.coins == 1000,
            "Inspecting goals and recommendations cannot spend money");
        Require(state.Invest() && state.hired[0] && state.coins == 952, "Recommended hiring executes the real one-time purchase");
        Require(state.SuggestedInvestment.kind == MathscriptInvestmentKind.HireBus && state.Invest() && state.coins == 602,
            "Automation proceeds to transport independently");
        Require(state.SuggestedInvestment.kind == MathscriptInvestmentKind.HireCompiler && !state.Invest() && state.coins == 602,
            "Compiler automation exposes its true unaffordable price without charging");
        state.compiledRC = 3;
        Require(state.SuggestedInvestment.kind == MathscriptInvestmentKind.Quest && state.SuggestedInvestment.index == 0
            && state.OperationsGoal.title == "Automate compiler" && !state.Invest(),
            "Available math rewards can fund an unaffordable goal without awarding an unanswered quest");
        Require(state.AnswerQuest(0, 1) && state.SuggestedInvestment.kind == MathscriptInvestmentKind.HireCompiler,
            "A completed reward returns guidance to the original automation goal");
        state.coins = 10000;
        Require(state.Invest() && state.compilerManager && state.AutomationCount == state.AutomationTarget,
            "The guided path completes all production stages");
        Require(Math.Abs(state.NominalBusRate - 7.5) < 0.000001 && Math.Abs(state.NominalCompilerRate - 3 / 2.7) < 0.000001,
            "Pipeline metrics include actual movement, loading, fetching and automatic restart time");
        Require(state.SuggestedInvestment.kind == MathscriptInvestmentKind.UpgradeFloor && state.SuggestedInvestment.index == 0,
            "A production bottleneck recommends effective output rather than a dormant new floor");
        state.levels[0] = 10;
        Require(state.NextFloorMilestone(0) == 25 && state.SuggestedInvestment.kind == MathscriptInvestmentKind.UpgradeTrack
            && state.SuggestedInvestment.index == 3, "A compiler bottleneck chooses useful throughput instead of conversion");
        state.tracks[3] = 5;
        state.tracks[4] = 2;
        Require(Math.Abs(state.NominalBusRate - state.NominalCompilerRate) < 0.000001
            && state.SuggestedInvestment.kind == MathscriptInvestmentKind.UpgradeTrack && state.SuggestedInvestment.index == 0,
            "Tied pipeline bottlenecks recommend staged throughput improvements instead of more production");
        state.lifetime = 10000;
        int level = state.levels[0];
        Require(state.SuggestedInvestment.kind == MathscriptInvestmentKind.Refactor && !state.Invest() && state.levels[0] == level,
            "Prestige recommendations never reset the company without confirmation");
        state.levels[0] = 500;
        Require(state.NextFloorMilestone(0) == 0, "Completed output tiers never advertise an unimplemented bonus");
        Debug.Log("MATHSCRIPT_OPERATIONS_PASS automation/affordability/bottlenecks/milestones/confirmed-prestige");
    }

    private static void CheckReturn(bool deep, int elapsed)
    {
        var expected = Fixture(deep);
        var returned = Clone(expected);
        double before = expected.coins;
        expected.Tick(Math.Min(28800, elapsed));
        double earned = returned.ClaimOffline(SavedAt + elapsed * 1000L);
        Require(earned == MathscriptEconomy.Round(expected.coins - before), "Offline income follows the actual production, travel, loading and compiler cycle");
        SamePipeline(returned, expected);
        Require(returned.clockMs == elapsed * 1000L, "Returning advances skill time once, including capped away time");
        double coins = returned.coins;
        double stock = returned.FloorBin;
        Require(returned.ClaimOffline(SavedAt + elapsed * 1000L) == 0 && returned.coins == coins && returned.FloorBin == stock, "Offline progress cannot be collected twice");
        Require(MathscriptSave.Valid(returned), "Offline progress remains a valid save");
    }

    private static MathscriptEconomy Fixture(bool deep)
    {
        var state = new MathscriptEconomy { busManager = true, compilerManager = true, savedAt = SavedAt };
        state.hired[0] = true;
        if (deep)
            for (int floor = 0; floor < 7; floor++)
            {
                state.levels[floor] = 10;
                state.hired[floor] = true;
            }
        return state;
    }

    private static MathscriptEconomy Clone(MathscriptEconomy state) => JsonUtility.FromJson<MathscriptEconomy>(JsonUtility.ToJson(state));

    private static void SamePipeline(MathscriptEconomy actual, MathscriptEconomy expected)
    {
        Require(actual.coins == expected.coins && actual.compiledRC == expected.compiledRC, "Returning credits each completed compiler batch once");
        Require(actual.FloorBin == expected.FloorBin && actual.busPayload == expected.busPayload
            && actual.compilerBuffer == expected.compilerBuffer && actual.processingBatch == expected.processingBatch,
            "Offline progression conserves floor stock, reserved payload and compiler resources");
        Require(actual.busState == expected.busState && actual.compilerState == expected.compilerState,
            "Returning preserves pipeline phase rather than restarting active jobs");
    }

    private static void Require(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }
}