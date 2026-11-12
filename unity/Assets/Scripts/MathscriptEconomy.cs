using System;

namespace MathscriptPrototype
{
    [Serializable]
    public sealed partial class MathscriptEconomy
    {
        public static readonly string[] FloorNames = { "Arcanos Compute Pod", "Blaze GPU Cluster", "Luna Storage Array", "Zenith Network Fabric", "Titan Cooling Plant", "Tempest AI Training Hall", "Shadow Hyperscale Core" };
        public static readonly double[] BaseCosts = { 8, 50, 500, 5000, 50000, 500000, 7000000 };
        public static readonly double[] BaseRates = { 0.5, 2, 10, 60, 400, 3000, 20000 };
        public static readonly int[] FloorMilestones = { 10, 25, 50, 100, 200, 300, 400, 500 };
        public int[] levels = { 1, 0, 0, 0, 0, 0, 0 };
        public double[] bins = new double[7];
        public bool[] hired = new bool[7];
        public double coins = 1000;
        public double lifetime;
        public double productionClock;
        public int version = 3;
        public long savedAt;
        public bool busManager;
        public bool compilerManager;
        public int viewport;
        public int[] tracks = new int[6];
        public bool[] challengesDone = new bool[3];
        public bool[] challengesPending = new bool[3];
        public static readonly string[] TrackNames = { "Bus capacity", "Bus speed", "Bus loading", "Compiler batch", "Compiler processing", "Compiler conversion" };
        public static readonly double[] TrackBases = { 25, 50, 60, 30, 50, 100 };
        public static readonly string[] Questions = { "Each run adds 4 compute units. How many do 3 runs add?", "A rack makes 5 units each second. How many in 4 seconds?", "Six upgrades cost $8 each. What is the total cost?" };
        public static readonly string[][] Choices = { new[] { "8", "12", "16" }, new[] { "20", "15", "25" }, new[] { "$42", "$54", "$48" } };
        public static readonly int[] CorrectChoices = { 1, 0, 2 };
        public static readonly int[] Rewards = { 50, 150, 400 };
        public static MathscriptEconomy CreateCompany() => new MathscriptEconomy { coins = 10, levels = new int[7] };

        public double FloorRate(int floor)
        {
            return FloorRateAtLevel(floor, levels[floor]);
        }

        private double FloorRateAtLevel(int floor, int level)
        {
            return BaseFloorRate(floor, level) * GlobalMultiplier * (research[0] ? 1.25 : 1) * (SkillActive(floor) ? 2 : 1);
        }

        private double BaseFloorRate(int floor, int level)
        {
            int multiplier = 1;
            foreach (int milestone in FloorMilestones)
                if (level >= milestone) multiplier++;
            return level * BaseRates[floor] * multiplier * (floor >= 4 ? 2 : 1);
        }

        private static double FloorCostAtLevel(int floor, int level) => level == 0 && floor < 2
            ? (floor == 0 ? 10 : 1000) : floor == 0 && level == 1 ? 11 : Math.Ceiling(BaseCosts[floor] * Math.Pow(1.15, level));
        public double FloorCost(int floor) => FloorCostAtLevel(floor, levels[floor]);
        public double GenerationYield(int floor) => levels[floor] > 0 ? Math.Max(7.5, Round(FloorRate(floor) * 1.25)) : 0;
        public bool Generate(int floor)
        {
            if (levels[floor] == 0) return false;
            bins[floor] = Round(bins[floor] + GenerationYield(floor));
            return true;
        }

        internal (double cost, int count) QuoteFloorUpgrade(int floor, int quantity)
        {
            int count = 0;
            double cost = 0;
            int limit = quantity < 0 ? 10000 : quantity;
            while (count < limit)
            {
                double next = FloorCostAtLevel(floor, levels[floor] + count);
                if (double.IsInfinity(cost + next) || quantity < 0 && coins < cost + next) break;
                cost += next;
                count++;
            }
            return (cost, count);
        }

        public bool UpgradeFloor(int floor, int quantity = 1)
        {
            int firstLocked = Array.FindIndex(levels, level => level == 0);
            if (levels[floor] == 0 && floor != firstLocked) return false;
            int previous = TotalLevels;
            var purchase = QuoteFloorUpgrade(floor, quantity);
            if (purchase.count == 0 || quantity > 0 && purchase.count != quantity || coins < purchase.cost) return false;
            coins = Round(coins - purchase.cost);
            levels[floor] += purchase.count;
            int[] thresholds = { 2, 5, 10 };
            for (int challenge = 0; challenge < 3; challenge++)
                if (previous < thresholds[challenge] && TotalLevels >= thresholds[challenge] && !challengesDone[challenge])
                    challengesPending[challenge] = true;
            return true;
        }

        public bool HireFloor(int floor)
        {
            double cost = Math.Ceiling(BaseCosts[floor] * 6);
            if (levels[floor] == 0 || hired[floor] || coins < cost) return false;
            coins = Round(coins - cost);
            hired[floor] = true;
            return true;
        }

        public double TotalProduction { get { double sum = 0; for (int floor = 0; floor < 7; floor++) if (hired[floor]) sum += FloorRate(floor); return sum; } }
        public int TotalLevels { get { int sum = 0; foreach (int level in levels) sum += level; return sum; } }
        public int PendingChallenge => Array.FindIndex(challengesPending, pending => pending);
        public double FloorBin { get { double sum = 0; foreach (double bin in bins) sum += bin; return Round(sum); } }
        public double busPayload;
        public double compilerBuffer;
        public double processingBatch;
        public double compiledRC;
        public string busState = "IDLE";
        public string compilerState = "IDLE";
        public double busRemaining;
        public double compilerRemaining;
        public double autoBusClock;
        public double autoCompilerClock;
        public int[] route = new int[0];
        public int routeIndex;
        public int routeViewport;
        public int currentSlot = -1;
        public int targetSlot = -1;
        public int fromSlot = -1;
        public double tripCapacity;
        public double tripMove;
        public double tripLoad;
        public double moveDuration;
        public double cycleProcessing;
        public double BusPayload => busPayload;
        public double CompilerBuffer => compilerBuffer;
        public double ProcessingBatch => processingBatch;
        public double Coins => coins;
        public double CompiledRC => compiledRC;
        public string BusState => busState;
        public string CompilerState => compilerState;
        public double BusCapacity => (30 + tracks[0] * 10) * GlobalMultiplier * (research[1] ? 1.25 : 1);
        public double BusSpeed => Math.Min(2.5, 0.5 + tracks[1] * 0.05) * (SkillActive(7) ? 3 : 1);
        public double LoadingSeconds => Math.Max(0.3, (1.5 - tracks[2] * 0.1) / (SkillActive(7) ? 3 : 1));
        public double BatchSize => (3 + tracks[3] * 3) * (SkillActive(8) ? 5 : 1);
        public double ProcessingSeconds => Math.Max(0.5, Round(2 - tracks[4] * 0.15));
        public double Conversion => (2 + tracks[5] * 0.5) * (research[2] ? 1.25 : 1);
        public double TrackCost(int track) => Math.Ceiling(TrackBases[track] * Math.Pow(track == 2 ? 1.3 : 1.15, tracks[track]));
        public bool TrackCapped(int track) => (track == 1 && tracks[track] >= 40) || (track == 2 && tracks[track] >= 12) || (track == 4 && tracks[track] >= 10);
        public bool UpgradeTrack(int track)
        {
            if (TrackCapped(track) || coins < TrackCost(track)) return false;
            coins = Round(coins - TrackCost(track));
            tracks[track]++;
            return true;
        }
        public bool HireSector(bool bus)
        {
            double cost = bus ? 350 : 750;
            if ((bus ? busManager : compilerManager) || coins < cost) return false;
            coins = Round(coins - cost);
            if (bus) busManager = true; else compilerManager = true;
            return true;
        }
        public bool AnswerChallenge(int selected)
        {
            int challenge = PendingChallenge;
            if (challenge < 0 || selected != CorrectChoices[challenge]) return false;
            Credit(Rewards[challenge]);
            challengesPending[challenge] = false;
            challengesDone[challenge] = true;
            return true;
        }
        public void SkipChallenge()
        {
            int challenge = PendingChallenge;
            if (challenge < 0) return;
            challengesPending[challenge] = false;
            challengesDone[challenge] = true;
        }
        private void Credit(double amount) { coins = Round(coins + amount); lifetime = Round(lifetime + amount); }

        public void AddProduction(double amount)
        {
            if (double.IsNaN(amount) || double.IsInfinity(amount) || amount < 0)
                throw new ArgumentOutOfRangeException(nameof(amount));
            bins[0] = Round(bins[0] + amount);
        }

        public bool SendBus()
        {
            if (BusState != "IDLE" || FloorBin <= 0) return false;
            routeViewport = 0;
            var visits = new System.Collections.Generic.List<int>();
            for (int floor = 6; floor >= 0; floor--)
                if (bins[floor] > 0) visits.Add(floor);
            route = visits.ToArray();
            routeIndex = 0;
            currentSlot = -1;
            tripCapacity = BusCapacity;
            tripMove = Math.Max(0.2, Math.Round(500 / BusSpeed, MidpointRounding.AwayFromZero) / 1000);
            tripLoad = LoadingSeconds;
            MoveToNext();
            return true;
        }

        public bool Compile()
        {
            if (CompilerState != "IDLE" || CompilerBuffer <= 0) return false;
            compilerState = "FETCHING";
            compilerRemaining = 0.6;
            cycleProcessing = ProcessingSeconds;
            return true;
        }

        public void Tick(double seconds)
        {
            if (double.IsNaN(seconds) || double.IsInfinity(seconds) || seconds < 0)
                throw new ArgumentOutOfRangeException(nameof(seconds));
            while (seconds > 0.000000001)
            {
                double step = Math.Min(seconds, 0.1 - productionClock);
                if (busState != "IDLE") step = Math.Min(step, busRemaining);
                if (compilerState != "IDLE") step = Math.Min(step, compilerRemaining);
                if (contracts.truckState != "IDLE") step = Math.Min(step, contracts.truckRemaining);
                if (busManager && busState == "IDLE") step = Math.Min(step, Math.Max(0, 0.1 - autoBusClock));
                if (compilerManager && compilerState == "IDLE") step = Math.Min(step, Math.Max(0, 0.1 - autoCompilerClock));
                step = Math.Max(0, step);
                for (int manager = 0; manager < 9; manager++)
                    if (skillUntil[manager] > clockMs) step = Math.Min(step, (skillUntil[manager] - clockMs) / 1000);
                productionClock += step;
                if (busState != "IDLE") busRemaining -= step;
                if (compilerState != "IDLE") compilerRemaining -= step;
                if (contracts.truckState != "IDLE") contracts.truckRemaining -= step;
                if (busState == "IDLE") autoBusClock += step; else autoBusClock = 0;
                if (compilerState == "IDLE") autoCompilerClock += step; else autoCompilerClock = 0;
                seconds -= step;
                if (productionClock >= 0.1 - 0.000000001)
                {
                    productionClock = 0;
                    for (int floor = 0; floor < 7; floor++)
                        if (hired[floor]) bins[floor] = Round(bins[floor] + FloorRate(floor) * 0.1);
                }
                clockMs = Math.Round(clockMs + step * 1000, 6);
                if (busState != "IDLE" && busRemaining <= 0.000000001) BusTransition();
                if (compilerState != "IDLE" && compilerRemaining <= 0.000000001) CompilerTransition();
                if (contracts.truckState != "IDLE" && contracts.truckRemaining <= 0.000000001) ContractTruckTransition();
                if (contracts.truckState == "IDLE") RequestContractPickup();
                if (busManager && busState == "IDLE" && autoBusClock >= 0.1 - 0.000000001) { autoBusClock = 0; SendBus(); }
                if (compilerManager && compilerState == "IDLE" && autoCompilerClock >= 0.1 - 0.000000001) { autoCompilerClock = 0; Compile(); }
            }
        }

        private void Collect(int floor)
        {
            double take = Round(Math.Min(bins[floor], Math.Max(0, tripCapacity - busPayload)));
            bins[floor] = Round(bins[floor] - take);
            busPayload = Round(busPayload + take);
        }
        private void MoveToNext()
        {
            fromSlot = currentSlot;
            targetSlot = route[routeIndex];
            moveDuration = Math.Max(tripMove, Math.Abs(targetSlot - currentSlot) * tripMove);
            busRemaining = moveDuration;
            busState = "MOVING_UP";
        }
        private void BusTransition()
        {
            switch (busState)
            {
                case "MOVING_UP": currentSlot = targetSlot; busState = "LOADING"; busRemaining = tripLoad; break;
                case "LOADING":
                    Collect(route[routeIndex++]);
                    if (routeIndex < route.Length && busPayload < tripCapacity) MoveToNext();
                    else { fromSlot = currentSlot; targetSlot = -1; moveDuration = Math.Max(tripMove, (currentSlot + 1) * tripMove); busState = "MOVING_DOWN"; busRemaining = moveDuration; }
                    break;
                case "MOVING_DOWN": currentSlot = -1; busState = "UNLOADING"; busRemaining = 0.4; break;
                case "UNLOADING": compilerBuffer = Round(compilerBuffer + busPayload); busPayload = 0; busState = "IDLE"; busRemaining = 0; break;
            }
        }
        public double FlowMultiplier()
        {
            double production = 0;
            int highest = -1;
            int stops = 0;
            for (int floor = 0; floor < 7; floor++)
            {
                production += FloorRate(floor);
                if (levels[floor] == 0 || (!hired[floor] && bins[floor] <= 0)) continue;
                highest = Math.Max(highest, floor);
                stops++;
            }
            double move = Math.Max(0.2, Math.Round(500 / BusSpeed, MidpointRounding.AwayFromZero) / 1000);
            double busRate = highest >= 0 ? BusCapacity / (2 * (highest + 1) * move + stops * LoadingSeconds + 0.5) : 0;
            double compilerRate = BatchSize / (Math.Max(0.3, ProcessingSeconds) + 0.7);
            return 1 + 0.25 * Math.Min(production, Math.Min(busRate, compilerRate)) / Math.Max(1, Math.Max(production, Math.Max(busRate, compilerRate)));
        }
        private void CompilerTransition()
        {
            if (compilerState == "FETCHING")
            {
                processingBatch = Round(Math.Min(BatchSize, compilerBuffer));
                compilerBuffer = Round(compilerBuffer - processingBatch);
                if (processingBatch <= 0) { compilerState = "IDLE"; compilerRemaining = 0; return; }
                compilerState = "PROCESSING";
                compilerRemaining = cycleProcessing;
            }
            else
            {
                SettleCompiledCargo(processingBatch);
                compiledRC = Round(compiledRC + processingBatch);
                processingBatch = 0;
                compilerState = "IDLE";
                compilerRemaining = 0;
            }
        }
        public double ClaimOffline(long now)
        {
            double elapsed = savedAt == 0 ? 0 : Math.Max(0, (now - savedAt) / 1000.0);
            double seconds = Math.Min(28800, elapsed);
            savedAt = now;
            double returnClock = clockMs + elapsed * 1000;
            double before = coins;
            if (seconds >= 60) Tick(seconds);
            clockMs = Math.Round(returnClock, 6);
            return Round(coins - before);
        }
        public static double Round(double value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);
    }
}