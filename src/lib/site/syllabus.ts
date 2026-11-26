/**
 * The whole series, defined once (DESIGN §4, §11). The home page, series navigation
 * and the content validator all read from here. Post frontmatter must agree with it.
 */

export type PartNumber = 0 | 1 | 2 | 3 | 4 | 5;

export interface Part {
  number: PartNumber;
  title: string;
}

export interface SyllabusEntry {
  number: number;
  slug: string;
  title: string;
  part: PartNumber;
  /** One line, shown on the home page. */
  description: string;
  /** Slugs of earlier posts. */
  prerequisites: readonly string[];
  needs3d?: boolean;
}

export const parts: readonly Part[] = [
  { number: 0, title: 'Foundations' },
  { number: 1, title: 'Estimation theory' },
  { number: 2, title: 'Bayes filters and the Kalman family' },
  { number: 3, title: 'Geometry for robotics' },
  { number: 4, title: 'SLAM' },
];

export const syllabus: readonly SyllabusEntry[] = [
  // Part 0
  {
    number: 1,
    slug: 'where-am-i',
    title: 'Where Am I? Why Estimation Matters',
    part: 0,
    description: 'Every sensor and every motion is uncertain. Estimation is a best guess plus an honest error bar.',
    prerequisites: [],
  },
  {
    number: 2,
    slug: 'gaussians-and-covariance',
    title: 'Gaussians and Covariance',
    part: 0,
    description: 'The bell curve in one and many dimensions, and how a covariance matrix draws an ellipse.',
    prerequisites: ['where-am-i'],
  },
  {
    number: 3,
    slug: 'conditioning-and-marginalizing',
    title: 'Slicing and Squashing: Conditioning vs. Marginalizing',
    part: 0,
    description: 'Joint, marginal and conditional Gaussians, the Schur complement, and why the two forms are duals.',
    prerequisites: ['gaussians-and-covariance'],
  },
  {
    number: 4,
    slug: 'propagating-uncertainty',
    title: 'Pushing Gaussians Through Functions',
    part: 0,
    description: 'Linear maps keep Gaussians Gaussian. Nonlinear ones bend them into bananas; Jacobians approximate.',
    prerequisites: ['conditioning-and-marginalizing'],
  },
  // Part 1
  {
    number: 5,
    slug: 'least-squares',
    title: 'Least Squares, Seen as Squares',
    part: 1,
    description: 'Normal equations, projections and weights, with every residual drawn as an actual square.',
    prerequisites: ['gaussians-and-covariance'],
  },
  {
    number: 6,
    slug: 'mle-and-map',
    title: 'Likelihood, Priors, and the Posterior',
    part: 1,
    description: 'Maximum likelihood, MAP and Bayes’ rule, and why Gaussian noise leads back to least squares.',
    prerequisites: ['least-squares'],
  },
  {
    number: 7,
    slug: 'estimator-quality',
    title: 'What Makes a Good Estimator?',
    part: 1,
    description: 'Bias, variance, consistency, Fisher information and the Cramér–Rao lower bound.',
    prerequisites: ['mle-and-map'],
  },
  {
    number: 8,
    slug: 'recursive-least-squares',
    title: 'Learning One Measurement at a Time',
    part: 1,
    description: 'Recursive least squares: the batch answer, updated one point at a time. The bridge to Kalman.',
    prerequisites: ['least-squares', 'mle-and-map'],
  },
  {
    number: 9,
    slug: 'nonlinear-least-squares',
    title: 'Nonlinear Least Squares: Gauss–Newton and Levenberg–Marquardt',
    part: 1,
    description: 'Linearize, solve, repeat. Why damping helps and why the starting point matters.',
    prerequisites: ['propagating-uncertainty', 'least-squares'],
  },
  // Part 2
  {
    number: 10,
    slug: 'bayes-filter',
    title: 'The Bayes Filter: Predict, Update, Repeat',
    part: 2,
    description: 'Beliefs over time: prediction as convolution, measurement as multiplication, then normalize.',
    prerequisites: ['mle-and-map'],
  },
  {
    number: 11,
    slug: 'kalman-filter-1d',
    title: 'The Kalman Filter in One Dimension',
    part: 2,
    description: 'Gaussian beliefs, the product of two Gaussians, and the gain as a ratio of trust.',
    prerequisites: ['bayes-filter', 'conditioning-and-marginalizing'],
  },
  {
    number: 12,
    slug: 'kalman-filter',
    title: 'The Kalman Filter',
    part: 2,
    description: 'State-space models and the full multivariate filter, estimating a velocity nobody measures.',
    prerequisites: ['kalman-filter-1d'],
  },
  {
    number: 13,
    slug: 'tuning-and-consistency',
    title: 'Tuning Q and R, and Knowing When a Filter Lies',
    part: 2,
    description: 'Innovations, NIS and NEES: tests that tell an honest filter from an overconfident one.',
    prerequisites: ['kalman-filter', 'estimator-quality'],
  },
  {
    number: 14,
    slug: 'robot-models-2d',
    title: 'Robots in the Plane: Motion and Sensor Models',
    part: 2,
    description: 'Unicycle and odometry motion models, range–bearing sensors, and their Jacobians.',
    prerequisites: ['propagating-uncertainty'],
  },
  {
    number: 15,
    slug: 'extended-kalman-filter',
    title: 'The Extended Kalman Filter',
    part: 2,
    description: 'Linearize around the estimate and run a Kalman filter. Localization with known landmarks.',
    prerequisites: ['kalman-filter', 'robot-models-2d'],
  },
  {
    number: 16,
    slug: 'unscented-kalman-filter',
    title: 'The Unscented Kalman Filter',
    part: 2,
    description: 'Push a handful of sigma points through the nonlinearity instead of a Jacobian.',
    prerequisites: ['extended-kalman-filter'],
  },
  {
    number: 17,
    slug: 'particle-filter',
    title: 'Particle Filters and Monte Carlo Localization',
    part: 2,
    description: 'Represent belief with samples: weight, resample, and find a lost robot.',
    prerequisites: ['bayes-filter', 'robot-models-2d'],
  },
  {
    number: 18,
    slug: 'smoothing',
    title: 'Looking Back: Filtering vs. Smoothing vs. Batch',
    part: 2,
    description: 'The RTS smoother uses future data to fix the past, and equals the batch solution.',
    prerequisites: ['kalman-filter'],
  },
  {
    number: 19,
    slug: 'information-filter',
    title: 'The Information Form and the Shape of Sparsity',
    part: 2,
    description: 'Work with the inverse covariance: cheap updates, and a sparse matrix where P is dense.',
    prerequisites: ['smoothing', 'conditioning-and-marginalizing'],
  },
  // Part 3
  {
    number: 20,
    slug: 'rotations',
    title: 'Rotations Without Tears',
    part: 3,
    description: 'Rotation matrices, Euler angles and gimbal lock, axis–angle, quaternions and slerp.',
    prerequisites: ['gaussians-and-covariance'],
    needs3d: true,
  },
  {
    number: 21,
    slug: 'lie-groups-for-robotics',
    title: 'A Gentle Lie Theory for Robotics',
    part: 3,
    description: 'Tangent spaces, Exp and Log, ⊕ and ⊖: the toolkit for estimating on curved spaces.',
    prerequisites: ['rotations', 'propagating-uncertainty'],
  },
  {
    number: 22,
    slug: 'uncertainty-on-poses',
    title: 'Uncertainty on Poses: Where Bananas Come From',
    part: 3,
    description: 'Gaussians in the tangent space, compounding uncertain poses, and why ellipses fail.',
    prerequisites: ['lie-groups-for-robotics'],
  },
  // Part 4
  {
    number: 23,
    slug: 'the-slam-problem',
    title: 'The SLAM Problem',
    part: 4,
    description: 'Mapping and localizing at once: why robot and landmark estimates become correlated.',
    prerequisites: ['extended-kalman-filter', 'uncertainty-on-poses'],
  },
  {
    number: 24,
    slug: 'ekf-slam',
    title: 'EKF-SLAM',
    part: 4,
    description: 'Grow the state with every landmark, and watch a loop closure shrink every ellipse.',
    prerequisites: ['the-slam-problem'],
  },
  {
    number: 25,
    slug: 'data-association',
    title: 'Data Association: Which Landmark Is That?',
    part: 4,
    description: 'Nearest neighbor, Mahalanobis gating and joint compatibility, and the cost of a wrong match.',
    prerequisites: ['ekf-slam'],
  },
  {
    number: 26,
    slug: 'factor-graphs',
    title: 'Factor Graphs: SLAM as Optimization',
    part: 4,
    description: 'Write SLAM as a sparse nonlinear least-squares problem over a graph of factors.',
    prerequisites: ['nonlinear-least-squares', 'smoothing', 'the-slam-problem'],
  },
  {
    number: 27,
    slug: 'pose-graph-optimization',
    title: 'Pose Graph Optimization',
    part: 4,
    description: 'Relative-pose factors, loop closures and Gauss–Newton on the manifold snap a drifted map into place.',
    prerequisites: ['factor-graphs', 'uncertainty-on-poses'],
  },
  {
    number: 28,
    slug: 'sparsity-and-solvers',
    title: 'Sparsity, Ordering, and Marginalization',
    part: 4,
    description: 'Variable ordering, fill-in, sparse Cholesky, and the dense block marginalization leaves behind.',
    prerequisites: ['pose-graph-optimization', 'information-filter'],
  },
  {
    number: 29,
    slug: 'robust-optimization',
    title: 'When Loop Closures Lie: Robust Optimization',
    part: 4,
    description: 'M-estimators, IRLS and graduated non-convexity keep a few bad edges from wrecking the map.',
    prerequisites: ['pose-graph-optimization'],
  },
  {
    number: 30,
    slug: 'incremental-smoothing',
    title: 'Incremental Smoothing: The Idea Behind iSAM',
    part: 4,
    description: 'Update only what a new measurement touches instead of re-solving from scratch.',
    prerequisites: ['sparsity-and-solvers'],
  },
  {
    number: 31,
    slug: 'toward-3d-and-vision',
    title: 'Toward 3D and Vision: Bundle Adjustment',
    part: 4,
    description: 'SE(3) pose graphs, the pinhole camera, reprojection error and bundle adjustment.',
    prerequisites: ['sparsity-and-solvers', 'lie-groups-for-robotics'],
    needs3d: true,
  },
  {
    number: 32,
    slug: 'capstone-mini-slam',
    title: 'Capstone: Build-Your-Own 2D SLAM',
    part: 4,
    description: 'Drive a robot and assemble a complete front-end and robust back-end, piece by piece.',
    prerequisites: ['data-association', 'pose-graph-optimization', 'robust-optimization'],
  },
];

export function entryBySlug(slug: string): SyllabusEntry | undefined {
  return syllabus.find((e) => e.slug === slug);
}

export function entryByNumber(n: number): SyllabusEntry | undefined {
  return syllabus.find((e) => e.number === n);
}

/**
 * Previous and next *published* posts in syllabus order, skipping unpublished ones.
 */
export function neighbors(
  slug: string,
  published: ReadonlySet<string>,
): { prev: SyllabusEntry | undefined; next: SyllabusEntry | undefined } {
  const i = syllabus.findIndex((e) => e.slug === slug);
  if (i < 0) return { prev: undefined, next: undefined };
  const prev = syllabus
    .slice(0, i)
    .reverse()
    .find((e) => published.has(e.slug));
  const next = syllabus.slice(i + 1).find((e) => published.has(e.slug));
  return { prev, next };
}

/** Folder name for a post: `NN-slug`. */
export function folderName(e: SyllabusEntry): string {
  return `${String(e.number).padStart(2, '0')}-${e.slug}`;
}
