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
      { tex: '\\gamma', meaning: 'level of a contour of the quadratic form, d_M² = γ' },
      { tex: '\\chi^2_n(p)', meaning: 'p-quantile of the chi-square distribution with n degrees of freedom' },
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
      { tex: '\\mathbf{u}_k', meaning: 'control input / odometry' },
      { tex: 'x_k,\\ y_k,\\ \\theta_k', meaning: 'components of a planar pose: position (m) and heading (rad)' },
      { tex: 'd_k,\\ \\Delta\\theta_k', meaning: 'odometry reading: distance driven, then turn' },
      { tex: '\\alpha', meaning: 'odometry noise level (error std per √m driven)' },
      { tex: '\\ell', meaning: 'total distance driven' },
      { tex: '\\mathbf{z}_k', meaning: 'measurement' },
      { tex: '\\mathbf{F}_k,\\ f(\\cdot)', meaning: 'linear state transition / nonlinear motion model' },
      { tex: '\\mathbf{B}_k', meaning: 'control-input matrix' },
      { tex: '\\mathbf{H}_k,\\ h(\\cdot)', meaning: 'linear measurement matrix / nonlinear measurement model' },
      { tex: '\\mathbf{w}_k \\sim \\N(\\mathbf{0},\\mathbf{Q}_k)', meaning: 'process noise and its covariance' },
      { tex: '\\mathbf{v}_k \\sim \\N(\\mathbf{0},\\mathbf{R}_k)', meaning: 'measurement noise and its covariance' },
      { tex: '\\boldsymbol{\\nu}_k,\\ \\mathbf{S}_k', meaning: 'innovation and innovation covariance' },
      { tex: '\\mathbf{K}_k', meaning: 'Kalman gain' },
      {
        tex: '\\boldsymbol{\\Omega} = \\mathbf{P}^{-1},\\ \\boldsymbol{\\xi} = \\boldsymbol{\\Omega}\\hat{\\mathbf{x}}',
        meaning: 'information matrix and information vector',
      },
      {
        tex: '\\mathcal{X}^{[i]},\\ W^{[i]}_m,\\ W^{[i]}_c',
        meaning: 'sigma points and their mean / covariance weights',
      },
      {
        tex: '\\mathbf{x}^{[i]},\\ w^{[i]},\\ N_p,\\ N_{\\text{eff}}',
        meaning: 'particle i, its scalar weight, number of particles, effective sample size',
      },
      { tex: '\\epsilon_k,\\ \\epsilon_{\\nu,k}', meaning: 'NEES and NIS' },
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
      { tex: '\\boldsymbol{\\tau}', meaning: 'tangent-space (Lie algebra) vector' },
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
      { tex: '\\mathbf{m}_j', meaning: 'landmark j' },
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
      { tex: '\\rho(\\cdot)', meaning: 'robust kernel' },
    ],
  },
];

export const notationConflicts: readonly { tex: string; note: string }[] = [
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
