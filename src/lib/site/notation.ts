/**
 * Canonical notation (DESIGN §6.1), rendered on /notation/. Adding a symbol to the
 * series means adding it here and to the DESIGN table in the same commit.
 */
export interface NotationGroup {
  title: string;
  note?: string;
  rows: { tex: string; meaning: string }[];
}

export const notationGroups: readonly NotationGroup[] = [
  {
    title: 'General',
    rows: [
      { tex: '\\E,\\ \\Cov,\\ (\\cdot)\\T,\\ \\mathbf{I}', meaning: 'expectation, covariance, transpose, identity' },
      { tex: 'p(\\cdot),\\ \\bel(\\mathbf{x}_k)', meaning: 'probability density; belief' },
      { tex: 'k', meaning: 'time index' },
      { tex: 'n_x,\\ n_z', meaning: 'state and measurement dimensions' },
      { tex: '\\R^{n}', meaning: 'the space of real n-vectors' },
    ],
  },
  {
    title: 'Part 0: Gaussians',
    rows: [
      {
        tex: '\\N(\\boldsymbol{\\mu}, \\boldsymbol{\\Sigma})',
        meaning: 'Gaussian with generic mean and covariance (used in Part 0)',
      },
      { tex: '\\mu,\\ \\sigma', meaning: 'mean and standard deviation of a scalar Gaussian' },
      {
        tex: '\\sigma_x,\\ \\sigma_y,\\ \\rho',
        meaning: 'per-axis standard deviations and correlation coefficient of a 2D Gaussian',
      },
      { tex: 'n', meaning: 'dimension of a generic random vector (filters use n_x and n_z)' },
      { tex: '\\lambda_1 \\ge \\lambda_2', meaning: 'eigenvalues of a covariance matrix (Part 0 only)' },
      { tex: '\\mathbf{v}_1,\\ \\mathbf{v}_2', meaning: 'unit eigenvectors of a covariance matrix' },
      { tex: '\\mathbf{L}', meaning: 'lower-triangular Cholesky factor, Σ = L Lᵀ' },
      { tex: '\\mathbf{z} \\sim \\N(\\mathbf{0}, \\mathbf{I})', meaning: 'standard-normal (whitened) vector' },
      { tex: 'd_M', meaning: 'Mahalanobis distance' },
      {
        tex: '\\mathbf{x}_1, \\mathbf{x}_2;\\ \\boldsymbol{\\Sigma}_{11}, \\boldsymbol{\\Sigma}_{12}, \\ldots;\\ \\boldsymbol{\\Omega}_{11}, \\boldsymbol{\\xi}_1, \\ldots',
        meaning: 'blocks of a partitioned Gaussian and of its covariance / information form',
      },
      { tex: 'a', meaning: 'an observed (conditioned-on) value, as in x = a' },
      { tex: '\\mathbf{A},\\ \\mathbf{b}', meaning: 'matrix and offset of a linear map y = A x + b' },
      {
        tex: '\\mathbf{J} = \\partial f / \\partial \\mathbf{x}',
        meaning: 'Jacobian of a function, evaluated at the linearization point',
      },
      { tex: 'r,\\ \\theta', meaning: 'range and bearing of a polar (range–bearing) reading' },
      { tex: '\\gamma', meaning: 'level of a contour of the quadratic form, d_M² = γ' },
      { tex: '\\chi^2_n(p)', meaning: 'p-quantile of the chi-square distribution with n degrees of freedom' },
    ],
  },
  {
    title: 'Part 1: Estimation from data',
    rows: [
      { tex: 'm', meaning: 'number of measurements' },
      { tex: 't_i,\\ y_i', meaning: 'data point i in a curve fit: input and measured value' },
      { tex: '\\mathbf{y}', meaning: 'stacked measurements (or the output of a function, Part 0)' },
      { tex: '\\mathbf{r} = \\mathbf{y} - \\mathbf{A}\\mathbf{x}', meaning: 'residual vector of a linear fit' },
      { tex: '\\mathbf{W} = \\diag(w_1, \\ldots, w_m)', meaning: 'measurement weights, usually wᵢ = 1/σᵢ²' },
      { tex: '\\mathcal{L}(\\cdot)', meaning: 'likelihood: p(data | parameter) read as a function of the parameter' },
      { tex: '\\mu_0,\\ \\sigma_0', meaning: 'mean and standard deviation of a Gaussian prior' },
      { tex: '\\kappa', meaning: 'prior weight in MAP (1 = ordinary Bayes, 0 = ignore the prior)' },
      { tex: '\\bar{z}', meaning: 'average of the measurements' },
      { tex: '\\mathcal{I}', meaning: 'Fisher information (of one measurement)' },
      { tex: '\\mathbf{a}_k', meaning: 'regressor: row k of the design matrix A' },
      { tex: '\\beta', meaning: 'forgetting factor in recursive least squares; memory ≈ 1/(1 − β)' },
      { tex: '\\lambda_0', meaning: 'initial Levenberg–Marquardt damping' },
      { tex: 'z_j', meaning: 'a scalar measurement, e.g. the range to anchor j' },
    ],
  },
  {
    title: 'Parts 1–2: Estimation and filtering',
    rows: [
      { tex: '\\mathbf{x}_k', meaning: 'state at time k (in SLAM it may include poses and landmarks)' },
      { tex: '\\hat{\\mathbf{x}}_{k\\mid k-1},\\ \\mathbf{P}_{k\\mid k-1}', meaning: 'predicted mean and covariance' },
      {
        tex: '\\hat{\\mathbf{x}}_{k\\mid k},\\ \\mathbf{P}_{k\\mid k}',
        meaning: 'updated (posterior) mean and covariance',
      },
      {
        tex: '\\hat{\\mathbf{x}}_{k\\mid N},\\ \\mathbf{P}_{k\\mid N}',
        meaning: 'smoothed mean and covariance: the estimate of time k from all N steps of data (Post 18)',
      },
      { tex: '\\mathbf{C}_k', meaning: 'RTS smoother gain (Post 18; from Part 3 on, bold C is a rotation matrix)' },
      { tex: 'L', meaning: 'lag of a fixed-lag smoother, in steps (Post 18)' },
      { tex: '\\mathbf{u}_k', meaning: 'control input / odometry' },
      { tex: 'x_k,\\ y_k,\\ \\theta_k', meaning: 'components of a planar pose: position (m) and heading (rad)' },
      { tex: 'd_k,\\ \\Delta\\theta_k', meaning: 'odometry reading: distance driven, then turn' },
      {
        tex: '\\alpha',
        meaning: 'odometry noise level (error std per √m driven; per 1 m move in the corridor of Post 10)',
      },
      { tex: '\\ell', meaning: 'total distance driven' },
      {
        tex: 'v,\\ \\omega',
        meaning: 'speed and turn rate: the controls of the velocity (unicycle) motion model (Post 14)',
      },
      {
        tex: '\\sigma_v,\\ \\sigma_\\omega',
        meaning: 'standard deviations of the actual speed and turn rate around the command',
      },
      {
        tex: '\\mathbf{M}_k,\\ \\mathbf{V}_k',
        meaning: 'covariance of the control noise, and the Jacobian ∂f/∂u that maps it into state space',
      },
      {
        tex: '\\delta_{\\text{rot1}},\\ \\delta_{\\text{trans}},\\ \\delta_{\\text{rot2}}',
        meaning: 'odometry reading as rotate, translate, rotate',
      },
      {
        tex: 'r,\\ \\phi',
        meaning: 'range and bearing of a landmark, the bearing measured from the robot’s heading (Part 2 on)',
      },
      { tex: '\\mathbf{z}_k', meaning: 'measurement' },
      { tex: '\\mathbf{z}_{1:k},\\ \\mathbf{u}_{1:k}', meaning: 'all measurements / controls from time 1 to k' },
      {
        tex: '\\overline{\\bel}(\\mathbf{x}_k)',
        meaning: 'predicted belief: after the motion, before the measurement at time k',
      },
      { tex: '\\eta', meaning: 'normalizing constant that makes a belief sum (or integrate) to 1' },
      {
        tex: '\\varepsilon',
        meaning: 'kidnapping probability per move in a histogram filter (Post 10)',
      },
      { tex: '\\mathbf{F}_k,\\ f(\\cdot)', meaning: 'linear state transition / nonlinear motion model' },
      { tex: '\\mathbf{B}_k', meaning: 'control-input matrix' },
      { tex: '\\Delta t', meaning: 'time step between filter updates (s)' },
      {
        tex: 'q',
        meaning:
          'white-noise acceleration density of a constant-velocity model (m²/s³): velocity variance gained per second',
      },
      { tex: '\\mathbf{H}_k,\\ h(\\cdot)', meaning: 'linear measurement matrix / nonlinear measurement model' },
      { tex: '\\mathbf{w}_k \\sim \\N(\\mathbf{0},\\mathbf{Q}_k)', meaning: 'process noise and its covariance' },
      { tex: '\\mathbf{v}_k \\sim \\N(\\mathbf{0},\\mathbf{R}_k)', meaning: 'measurement noise and its covariance' },
      { tex: '\\boldsymbol{\\nu}_k,\\ \\mathbf{S}_k', meaning: 'innovation and innovation covariance' },
      { tex: '\\mathbf{K}_k', meaning: 'Kalman gain' },
      {
        tex: 'K_\\infty,\\ P_\\infty',
        meaning: 'steady-state gain and variance of a filter with constant noise levels (Post 11)',
      },
      {
        tex: '\\boldsymbol{\\Omega} = \\mathbf{P}^{-1},\\ \\boldsymbol{\\xi} = \\boldsymbol{\\Omega}\\hat{\\mathbf{x}}',
        meaning: 'information matrix and information vector',
      },
      {
        tex: '\\alpha,\\ \\beta,\\ \\kappa,\\ \\lambda\\ \\text{(UT)}',
        meaning:
          'unscented-transform parameters: spread α, distribution β, secondary scaling κ, and λ = α²(n + κ) − n (Post 16)',
      },
      {
        tex: '\\mathcal{X}^{[i]},\\ W^{[i]}_m,\\ W^{[i]}_c',
        meaning: 'sigma points and their mean / covariance weights',
      },
      {
        tex: '\\mathbf{x}^{[i]},\\ w^{[i]},\\ N_p,\\ N_{\\text{eff}}',
        meaning: 'particle i, its scalar weight, number of particles, effective sample size',
      },
      {
        tex: 'w_{\\text{slow}},\\ w_{\\text{fast}}',
        meaning: 'long- and short-term averages of the measurement likelihood in augmented MCL (Post 17)',
      },
      { tex: '\\epsilon_k,\\ \\epsilon_{\\nu,k}', meaning: 'NEES and NIS' },
      {
        tex: 'M,\\ \\bar{\\epsilon}_k',
        meaning: 'number of Monte Carlo runs; a statistic averaged over them (Post 13)',
      },
    ],
  },
  {
    title: 'Part 3: Geometry',
    rows: [
      {
        tex: '\\mathbf{C} \\in \\SO(n)',
        meaning: 'rotation matrix (Barfoot’s convention; R is reserved for measurement noise)',
      },
      {
        tex: '\\mathbf{T} \\in \\SE(n),\\ \\mathbf{T}_{ij}',
        meaning: 'pose / rigid transform; relative pose of j in frame i',
      },
      { tex: '\\mathbf{t}', meaning: 'translation' },
      {
        tex: '\\mathbf{C}(\\theta),\\ \\mathbf{C}_x,\\ \\mathbf{C}_y,\\ \\mathbf{C}_z',
        meaning: 'rotation by θ in the plane; elementary 3D rotations about the x, y and z axes (Post 20)',
      },
      {
        tex: '\\psi,\\ \\theta,\\ \\phi',
        meaning: 'yaw, pitch, roll: Z–Y–X Euler angles, C = C_z(ψ) C_y(θ) C_x(φ) (Post 20 only)',
      },
      { tex: '\\boldsymbol{\\omega}', meaning: 'angular velocity, in the body frame (Post 20)' },
      { tex: '\\mathbf{E}', meaning: 'Euler-rate matrix: ω = E (ψ̇, θ̇, φ̇) (Post 20)' },
      {
        tex: '\\mathbf{u},\\ \\theta,\\ \\boldsymbol{\\theta} = \\theta\\mathbf{u}',
        meaning: 'unit rotation axis, rotation angle, and the rotation vector (axis times angle)',
      },
      { tex: '[\\mathbf{v}]_\\times', meaning: 'skew-symmetric matrix with [v]× w = v × w (also written v^)' },
      {
        tex: '\\mathbf{q} = (q_w, \\mathbf{q}_v),\\ \\mathbf{q}^*,\\ \\otimes',
        meaning: 'unit quaternion (scalar part first), its conjugate, and the Hamilton product',
      },
      { tex: 't', meaning: 'interpolation parameter, from 0 to 1 (Post 20)' },
      { tex: '\\mathbf{X},\\ \\mathbf{Y}', meaning: 'elements of a (matrix) Lie group, generic (Post 21)' },
      { tex: '\\boldsymbol{\\tau}', meaning: 'tangent-space (Lie algebra) vector' },
      {
        tex: '\\boldsymbol{\\tau} = (\\boldsymbol{\\rho}, \\theta)',
        meaning:
          'a tangent vector (twist) of SE(2): translation part ρ in the body frame, then the turn θ; on SE(3), (ρ, θ) with θ a rotation vector',
      },
      {
        tex: '\\mathbf{V}(\\theta)',
        meaning: 'the SE(2) matrix turning ρ into the translation of Exp(τ), t = V(θ) ρ (Post 21)',
      },
      { tex: 'N', meaning: 'number of steps: of data (Post 18), or of a motion split into pieces (Post 21)' },
      {
        tex: '\\bar{\\mathbf{T}}',
        meaning: 'mean of a Gaussian on a group, T = T̄ Exp(τ) with τ ~ N(0, P) (Post 22)',
      },
      { tex: '\\sigma_\\theta,\\ \\sigma_{xy}', meaning: 'heading and position noise per move (Post 22)' },
      { tex: '(\\cdot)^\\wedge,\\ (\\cdot)^\\vee', meaning: 'hat and vee' },
      { tex: '\\Exp,\\ \\Log', meaning: 'maps between ℝⁿ and the group (capitalized, as in Solà et al.)' },
      { tex: '\\oplus,\\ \\ominus', meaning: 'right-plus and right-minus on manifolds' },
      {
        tex: '\\mathbf{Ad}_{\\mathbf{T}},\\ \\mathbf{J}_r,\\ \\mathbf{J}_l',
        meaning: 'adjoint; right and left Jacobians',
      },
    ],
  },
  {
    title: 'Part 4: SLAM and optimization',
    rows: [
      { tex: '\\mathbf{m}_j', meaning: 'landmark j; the map is m = (m₁, …, mₙ) with n landmarks' },
      {
        tex: '\\mathbf{P}_{rr},\\ \\mathbf{P}_{rm},\\ \\mathbf{P}_{mm}',
        meaning: 'robot, robot–map and map blocks of the SLAM covariance (Posts 23–24)',
      },
      {
        tex: 'g(\\cdot),\\ \\mathbf{G}_r,\\ \\mathbf{G}_z',
        meaning: 'landmark position from its first reading, and its Jacobians with respect to the pose and the reading',
      },
      {
        tex: '\\mathcal{H},\\ D^2_{\\mathcal{H}}',
        meaning: 'a data-association hypothesis, and its joint Mahalanobis distance (Post 25)',
      },
      {
        tex: '\\rho_{ab}',
        meaning: 'largest canonical correlation between two estimates a and b (Post 23)',
      },
      { tex: '\\phi_i', meaning: 'factor i' },
      { tex: '\\mathbf{r}_i,\\ \\boldsymbol{\\Omega}_i', meaning: 'residual of factor i and its information matrix' },
      {
        tex: 'c(\\mathbf{x}) = \\tfrac12\\sum_i \\lVert \\mathbf{r}_i \\rVert^2_{\\boldsymbol{\\Omega}_i}',
        meaning: 'total cost',
      },
      { tex: '\\mathbf{J}', meaning: 'stacked Jacobian of the residuals' },
      {
        tex: '\\boldsymbol{\\Lambda} = \\mathbf{J}\\T\\boldsymbol{\\Omega}\\mathbf{J},\\ \\boldsymbol{\\eta} = -\\mathbf{J}\\T\\boldsymbol{\\Omega}\\mathbf{r}',
        meaning: 'Gauss–Newton system Λδ = η',
      },
      { tex: '\\boldsymbol{\\delta},\\ \\lambda', meaning: 'update step; Levenberg–Marquardt damping' },
      {
        tex: 'f_x, f_y, c_x, c_y',
        meaning: 'pinhole camera: focal lengths and principal point, in pixels (Post 31)',
      },
      {
        tex: '\\pi(\\cdot),\\ \\sigma_{\\text{px}}',
        meaning: 'projection of a point to a pixel; pixel noise (Post 31)',
      },
      { tex: '\\rho(\\cdot)', meaning: 'robust kernel' },
      {
        tex: 's_i = \\mathbf{r}_i\\T\\boldsymbol{\\Omega}_i\\mathbf{r}_i,\\ k_\\rho',
        meaning: 'squared Mahalanobis error of factor i; scale of a robust kernel, in units of √s (Post 29)',
      },
      { tex: "w_i = \\rho'(s_i)", meaning: 'IRLS weight of factor i (Post 29)' },
      { tex: '\\mu', meaning: 'GNC control parameter, shrunk from large to 1 (Post 29; not the mean of Part 0)' },
    ],
  },
];

export const notationConflicts: readonly { tex: string; note: string }[] = [
  {
    tex: '\\theta\\ \\text{(heading, pitch, rotation angle)}',
    note: 'θ is the heading of a planar pose (Post 14 on) and, in Part 3, the angle of a single rotation; in the plane these are the same thing. In Post 20’s Euler-angle formulas only, θ is the pitch.',
  },
  {
    tex: '\\phi\\ \\text{(bearing vs. roll)}',
    note: 'φ is the bearing of a landmark (Part 2 on); in Post 20’s Euler-angle formulas it is the roll.',
  },
  {
    tex: '\\rho\\ \\text{vs.}\\ \\boldsymbol{\\rho}\\ \\text{vs.}\\ \\rho(\\cdot)',
    note: 'An italic ρ is a correlation coefficient (Part 0); the bold ρ is the translation part of a tangent vector (Part 3); ρ(·) is a robust kernel (Part 4).',
  },
  {
    tex: '\\mathbf{V}(\\theta)\\ \\text{vs.}\\ \\mathbf{V}_k',
    note: 'With an angle argument, V(θ) is the SE(2) translation matrix of Exp (Post 21); with a time index, V_k is the control Jacobian of a motion model (Post 14).',
  },
  {
    tex: 't\\ \\text{vs.}\\ t_i\\ \\text{vs.}\\ \\mathbf{t}',
    note: 'An italic t without a subscript is an interpolation parameter (Post 20); t_i is an input in a curve fit (Part 1); the bold t is a translation.',
  },
  {
    tex: 'w^{[i]}\\ \\text{vs.}\\ \\mathbf{w}_k',
    note: 'A particle weight is a scalar with a bracketed superscript; process noise is a bold vector with a time subscript.',
  },
  {
    tex: '\\lambda\\ \\text{vs.}\\ \\lambda_1, \\lambda_2',
    note: 'A bare λ is the Levenberg–Marquardt damping. Eigenvalues always carry a subscript and appear only in Part 0, so context makes the meaning clear.',
  },
  {
    tex: 'x_k\\ \\text{vs.}\\ \\mathbf{x}_k',
    note: 'An italic x_k is the x-coordinate of a planar pose; a bold x_k is the whole state vector.',
  },
  {
    tex: '\\mathbf{C}_k\\ \\text{vs.}\\ \\mathbf{C} \\in SO(n)',
    note: 'With a time index, C_k is the RTS smoother gain (Post 18); without one, from Part 3 on, C is a rotation matrix.',
  },
  {
    tex: 'L\\ \\text{vs.}\\ \\mathbf{L}',
    note: 'An italic L is the lag of a fixed-lag smoother (Post 18); the bold L is a Cholesky factor.',
  },
  {
    tex: '\\theta\\ \\text{(heading)}\\ \\text{vs.}\\ \\theta\\ \\text{(bearing, Post 4)}',
    note: 'From Post 14 on, θ is the heading of a pose and a bearing is written φ. Post 4 used (r, θ) for a polar reading, before poses had headings.',
  },
  {
    tex: 'v\\ \\text{vs.}\\ \\mathbf{v}_k',
    note: 'An italic v is a speed (Post 14); the bold v_k with a time index is measurement noise.',
  },
  {
    tex: 'M\\ \\text{vs.}\\ \\mathbf{M}_k',
    note: 'A plain M counts Monte Carlo runs (Post 13); the bold M_k is the covariance of control noise (Post 14).',
  },
  {
    tex: '\\eta\\ \\text{vs.}\\ \\boldsymbol{\\eta}',
    note: 'A scalar η normalizes a belief (Post 10); the bold vector η is the right-hand side of the Gauss–Newton system (Part 4).',
  },
  {
    tex: '\\varepsilon\\ \\text{vs.}\\ \\epsilon_k',
    note: 'A bare ε (Post 10) is a kidnapping probability; ε with a time index is the NEES of a Kalman filter (Post 13).',
  },
  {
    tex: '\\beta,\\ \\kappa,\\ \\lambda\\ \\text{(UT)}',
    note: 'In Post 16 (and only there) β, κ and λ are unscented-transform parameters. Elsewhere β is the forgetting factor of Post 8, κ the prior weight of Post 6, and a bare λ the Levenberg–Marquardt damping.',
  },
  {
    tex: '\\alpha\\ \\text{(odometry)}\\ \\text{vs.}\\ \\alpha\\ \\text{(UKF)}',
    note: 'In Part 0 α is an odometry noise level; in the unscented Kalman filter (Post 16) it is a sigma-point spread parameter.',
  },
  {
    tex: '\\mathbf{z}\\ \\text{vs.}\\ \\mathbf{z}_k',
    note: 'Without a time index, z is a whitened standard-normal vector (Part 0). With a time index, z_k is a measurement.',
  },
  {
    tex: '\\rho\\ \\text{vs.}\\ \\rho(\\cdot)',
    note: 'In Part 0, ρ is a correlation coefficient. In Part 4, ρ(·) is a robust kernel, always written with its argument.',
  },
];
