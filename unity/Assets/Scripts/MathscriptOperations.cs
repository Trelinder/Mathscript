using System;

namespace MathscriptPrototype
{
    public enum MathscriptInvestmentKind { HireFloor, HireBus, HireCompiler, UpgradeFloor, UpgradeTrack, Refactor, Quest }

    [Serializable]
    public sealed class MathscriptInvestment
    {
        public MathscriptInvestmentKind kind;
        public int index;
        public double cost;
        public string title;
        public string action;
    }

    [Serializable]
    public sealed class MathscriptOperationsGoal
    {
        public string heading;
        public string title;
        public double progress;
        public double current;
        public double target;
    }

    public sealed partial class MathscriptEconomy
    {
        public int AutomationCount
        {
            get
            {
                int count = (busManager ? 1 : 0) + (compilerManager ? 1 : 0);
                for (int floor = 0; floor < 7; floor++) if (levels[floor] > 0 && hired[floor]) count++;
                return count;
            }
        }

        public int AutomationTarget => Array.FindAll(levels, level => level > 0).Length + 2;
        public double NominalBusRate => BusRateAt(tracks[0], tracks[1], tracks[2]);
        public double NominalCompilerRate => BatchSize / (ProcessingSeconds + 0.7);
        public double EstimatedIncome => busManager && compilerManager
            ? Math.Min(TotalProduction, Math.Min(NominalBusRate, NominalCompilerRate)) * Conversion * FlowMultiplier() : 0;

        private double BusRateAt(int capacity, int speed, int loading, int extraFloor = -1)
        {
            int deepest = -1;
            int stops = 0;
            for (int floor = 0; floor < 7; floor++)
                if (floor == extraFloor || levels[floor] > 0 && (hired[floor] || bins[floor] > 0))
                {
                    deepest = floor;
                    stops++;
                }
            if (deepest < 0) return 0;
            double moveSpeed = Math.Min(2.5, 0.5 + speed * 0.05) * (SkillActive(7) ? 3 : 1);
            double move = Math.Max(0.2, Math.Round(500 / moveSpeed, MidpointRounding.AwayFromZero) / 1000);
            double load = Math.Max(0.3, (1.5 - loading * 0.1) / (SkillActive(7) ? 3 : 1));
            double payload = (30 + capacity * 10) * GlobalMultiplier * (research[1] ? 1.25 : 1);
            return payload / (2 * (deepest + 1) * move + stops * load + 0.5);
        }

        public int NextFloorMilestone(int floor)
        {
            foreach (int milestone in FloorMilestones) if (levels[floor] < milestone) return milestone;
            return 0;
        }

        private static MathscriptInvestment Investment(MathscriptInvestmentKind kind, int index, double cost, string title, string action)
        {
            return new MathscriptInvestment { kind = kind, index = index, cost = cost, title = title, action = action };
        }

        private MathscriptInvestment FundInvestment(MathscriptInvestment candidate)
        {
            if (coins >= candidate.cost) return candidate;
            for (int quest = 0; quest < 3; quest++)
                if (QuestAvailable(quest))
                    return Investment(MathscriptInvestmentKind.Quest, quest, 0, QuestNames[quest] + " / +$" + QuestRewards[quest], "QUEST");
            return candidate;
        }

        public MathscriptInvestment SuggestedInvestment
        {
            get
            {
                if (levels[0] == 0)
                    return Investment(MathscriptInvestmentKind.UpgradeFloor, 0, FloorCost(0), FloorNames[0], "BUILD");
                for (int floor = 0; floor < 7; floor++)
                    if (levels[floor] > 0 && !hired[floor])
                        return FundInvestment(Investment(MathscriptInvestmentKind.HireFloor, floor, Math.Ceiling(BaseCosts[floor] * 6), FloorNames[floor], "HIRE"));
                if (!busManager) return FundInvestment(Investment(MathscriptInvestmentKind.HireBus, 7, 350, "Data bus manager", "HIRE"));
                if (!compilerManager) return FundInvestment(Investment(MathscriptInvestmentKind.HireCompiler, 8, 750, "Compiler manager", "HIRE"));
                if (RefactorReward > 0) return Investment(MathscriptInvestmentKind.Refactor, -1, 0, "Prime refactor / +" + RefactorReward + " tokens", "REFACTOR");

                double production = TotalProduction;
                double transport = NominalBusRate;
                double compilation = NominalCompilerRate;
                double baseline = Math.Min(production, Math.Min(transport, compilation));
                MathscriptInvestment best = null;
                MathscriptInvestment affordable = null;
                double bestScore = 0;
                double affordableScore = 0;
                if (production <= Math.Min(transport, compilation))
                {
                    int nextFloor = Array.FindIndex(levels, level => level == 0);
                    for (int floor = 0; floor < 7; floor++)
                    {
                        if (levels[floor] == 0 && floor != nextFloor) continue;
                        double gain = FloorRateAtLevel(floor, levels[floor] + 1) - FloorRate(floor);
                        double predictedBus = levels[floor] == 0 ? BusRateAt(tracks[0], tracks[1], tracks[2], floor) : transport;
                        double improvement = Math.Min(production + gain, Math.Min(predictedBus, compilation)) - baseline;
                        double cost = FloorCost(floor);
                        double fullCost = cost + (levels[floor] == 0 ? Math.Ceiling(BaseCosts[floor] * 6) : 0);
                        Consider(Investment(MathscriptInvestmentKind.UpgradeFloor, floor, cost, FloorNames[floor], levels[floor] == 0 ? "BUILD" : "UPGRADE"),
                            improvement / fullCost, ref best, ref bestScore, ref affordable, ref affordableScore);
                    }
                }
                else
                {
                    bool bus = transport <= compilation;
                    for (int track = bus ? 0 : 3; track < (bus ? 3 : 5); track++)
                    {
                        if (TrackCapped(track)) continue;
                        double predicted;
                        if (bus)
                            predicted = BusRateAt(tracks[0] + (track == 0 ? 1 : 0), tracks[1] + (track == 1 ? 1 : 0), tracks[2] + (track == 2 ? 1 : 0));
                        else
                            predicted = (3 + (tracks[3] + (track == 3 ? 1 : 0)) * 3) * (SkillActive(8) ? 5 : 1)
                                / (Math.Max(0.5, Round(2 - (tracks[4] + (track == 4 ? 1 : 0)) * 0.15)) + 0.7);
                        double improvement = Math.Min(production, Math.Min(bus ? predicted : transport, bus ? compilation : predicted)) - baseline;
                        if (improvement <= 0 && Math.Abs(transport - compilation) < 0.000001)
                            improvement = Math.Min(production, predicted) - baseline;
                        Consider(Investment(MathscriptInvestmentKind.UpgradeTrack, track, TrackCost(track), TrackNames[track], "UPGRADE"),
                            improvement / TrackCost(track), ref best, ref bestScore, ref affordable, ref affordableScore);
                    }
                }
                return FundInvestment(affordable ?? best ?? Investment(MathscriptInvestmentKind.UpgradeFloor, 0, FloorCost(0), FloorNames[0], "UPGRADE"));
            }
        }

        private void Consider(MathscriptInvestment candidate, double score, ref MathscriptInvestment best, ref double bestScore,
            ref MathscriptInvestment affordable, ref double affordableScore)
        {
            if (score <= 0 || double.IsNaN(score)) return;
            if (score > bestScore) { best = candidate; bestScore = score; }
            if (coins >= candidate.cost && score > affordableScore) { affordable = candidate; affordableScore = score; }
        }

        public bool Invest()
        {
            MathscriptInvestment candidate = SuggestedInvestment;
            switch (candidate.kind)
            {
                case MathscriptInvestmentKind.HireFloor: return HireFloor(candidate.index);
                case MathscriptInvestmentKind.HireBus: return HireSector(true);
                case MathscriptInvestmentKind.HireCompiler: return HireSector(false);
                case MathscriptInvestmentKind.UpgradeFloor: return UpgradeFloor(candidate.index);
                case MathscriptInvestmentKind.UpgradeTrack: return UpgradeTrack(candidate.index);
                default: return false;
            }
        }

        public MathscriptOperationsGoal OperationsGoal
        {
            get
            {
                MathscriptInvestment candidate = SuggestedInvestment;
                if (levels[0] == 0)
                    return new MathscriptOperationsGoal
                    {
                        heading = "NEW DATA CENTER", title = "Commission department 1", current = Math.Min(coins, candidate.cost),
                        target = candidate.cost, progress = Math.Min(1, coins / candidate.cost)
                    };
                if (AutomationCount < AutomationTarget)
                {
                    int floor = Array.FindIndex(hired, employed => !employed);
                    return new MathscriptOperationsGoal
                    {
                        heading = "AUTOMATION / " + AutomationCount + " OF " + AutomationTarget,
                        title = floor >= 0 && levels[floor] > 0 ? "Automate floor " + (floor + 1)
                            : !busManager ? "Automate data bus" : "Automate compiler",
                        current = AutomationCount, target = AutomationTarget, progress = (double)AutomationCount / AutomationTarget
                    };
                }
                if (candidate.kind == MathscriptInvestmentKind.Refactor)
                    return new MathscriptOperationsGoal { heading = "PERMANENT PROGRESS", title = candidate.title, current = RefactorReward, target = RefactorReward, progress = 1 };
                if (candidate.kind == MathscriptInvestmentKind.Quest)
                    return new MathscriptOperationsGoal { heading = "AVAILABLE MATH REWARD", title = candidate.title, current = 0, target = 1, progress = 0 };
                if (candidate.kind == MathscriptInvestmentKind.UpgradeFloor && levels[candidate.index] > 0)
                {
                    int target = NextFloorMilestone(candidate.index);
                    if (target > 0)
                        return new MathscriptOperationsGoal
                        {
                            heading = "FLOOR " + (candidate.index + 1) + " / NEXT MILESTONE",
                            title = "Level " + target + " output boost", current = levels[candidate.index], target = target,
                            progress = Math.Min(1, (double)levels[candidate.index] / target)
                        };
                }
                return new MathscriptOperationsGoal
                {
                    heading = "PIPELINE DEVELOPMENT", title = candidate.kind == MathscriptInvestmentKind.UpgradeFloor
                        ? (levels[candidate.index] == 0 ? "Open floor " : "Upgrade floor ") + (candidate.index + 1) : candidate.title,
                    current = Math.Min(coins, candidate.cost), target = candidate.cost, progress = candidate.cost > 0 ? Math.Min(1, coins / candidate.cost) : 1
                };
            }
        }
    }
}