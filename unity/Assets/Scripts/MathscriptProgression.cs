using System;

namespace MathscriptPrototype
{
    public sealed partial class MathscriptEconomy
    {
        public int claimedTokens;
        public int refactors;
        public bool[] research = new bool[3];
        public bool[] questsDone = new bool[3];
        public double clockMs;
        public double[] skillUntil = new double[9];
        public double[] cooldownUntil = new double[9];
        public static readonly string[] ResearchNames = { "Parallel algorithms", "Packet compression", "Compiler optimization" };
        public static readonly double[] ResearchCosts = { 2500, 7500, 20000 };
        public static readonly string[] ResearchEffects = { "+25% department output", "+25% bus capacity", "+25% conversion" };
        public static readonly string[] QuestNames = { "Cartridge packing", "Pipeline throughput", "Compute efficiency" };
        public static readonly string[] QuestQuestions = {
            "In this example, a data lift holds 30 RC. Each cartridge stores 6 RC. How many full cartridges fit?",
            "In this example, servers generate 10 RC/s, the data lift transfers 4 RC/s, and the compiler processes 8 RC/s. What is the sustained pipeline output?",
            "In this example, a data center earns 100 coins. A 10% permanent compute-efficiency bonus adds how many coins?" };
        public static readonly string[][] QuestChoices = { new[] { "4", "5", "6" }, new[] { "4", "8", "10" }, new[] { "1", "10", "100" } };
        public static readonly int[] QuestAnswers = { 1, 0, 1 };
        public static readonly int[] QuestRewards = { 250, 750, 2000 };
        public static readonly string[] QuestHints = {
            "Divide the lift's RC capacity by the RC stored in one cartridge.",
            "Each stage must handle the same RC. Find the slowest stage in the route.",
            "Ten percent means one tenth. Divide the starting income by ten." };
        public static readonly string[] QuestExplanations = {
            "30 RC / 6 RC = 5 cartridges. Five full cartridges use the lift's entire capacity.",
            "min(10, 4, 8) = 4 RC/s. The data lift is the bottleneck; faster servers alone cannot increase sustained output.",
            "100 coins x 10 / 100 = 10 coins. The example's total income becomes 110 coins after the efficiency bonus." };
        public double GlobalMultiplier => 1 + claimedTokens * 0.1;
        public int PotentialTokens => (int)Math.Floor(Math.Sqrt(lifetime / 10000));
        public int RefactorReward => Math.Max(0, PotentialTokens - claimedTokens);
        public bool SkillActive(int manager) => clockMs < skillUntil[manager];
        public double SkillSeconds(int manager) => Math.Max(0, (skillUntil[manager] - clockMs) / 1000);
        public double CooldownSeconds(int manager) => Math.Max(0, (cooldownUntil[manager] - clockMs) / 1000);

        public bool ActivateSkill(int manager)
        {
            if (manager < 0 || manager >= 9) return false;
            bool employed = manager < 7 ? hired[manager] : manager == 7 ? busManager : compilerManager;
            if (!employed || clockMs < cooldownUntil[manager] || SkillActive(manager)) return false;
            skillUntil[manager] = clockMs + 30000;
            cooldownUntil[manager] = clockMs + 150000;
            return true;
        }

        public bool BuyResearch(int node)
        {
            if (node < 0 || node >= 3 || research[node] || (node > 0 && !research[node - 1]) || coins < ResearchCosts[node]) return false;
            coins = Round(coins - ResearchCosts[node]);
            research[node] = true;
            return true;
        }

        public bool QuestAvailable(int quest) => quest >= 0 && quest < 3 && !questsDone[quest]
            && (quest == 0 ? compiledRC >= 3 : quest == 1 ? busManager && compilerManager : refactors > 0);

        public bool AnswerQuest(int quest, int choice)
        {
            if (!QuestAvailable(quest) || choice != QuestAnswers[quest]) return false;
            questsDone[quest] = true;
            Credit(QuestRewards[quest]);
            return true;
        }

        public bool PrimeRefactor()
        {
            if (RefactorReward <= 0) return false;
            claimedTokens = PotentialTokens;
            refactors++;
            coins = 1000;
            levels = new[] { 1, 0, 0, 0, 0, 0, 0 };
            bins = new double[7];
            hired = new bool[7];
            tracks = new int[6];
            busManager = compilerManager = false;
            busPayload = compilerBuffer = processingBatch = compiledRC = 0;
            ResetOperatingContracts();
            busRemaining = compilerRemaining = productionClock = autoBusClock = autoCompilerClock = 0;
            tripCapacity = tripMove = tripLoad = moveDuration = cycleProcessing = 0;
            busState = compilerState = "IDLE";
            route = new int[0];
            viewport = routeViewport = routeIndex = 0;
            currentSlot = targetSlot = fromSlot = -1;
            skillUntil = new double[9];
            cooldownUntil = new double[9];
            return true;
        }
    }
}